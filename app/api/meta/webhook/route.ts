import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifySignature } from "@/lib/meta";
import { ingestItem, resolveConnection, type SocialItem } from "@/lib/social-ingest";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------ verificação */

export async function GET(req: Request) {
  const u = new URL(req.url);
  const mode = u.searchParams.get("hub.mode");
  const token = u.searchParams.get("hub.verify_token");
  const challenge = u.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.META_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

/* ----------------------------------------------------------------- parse */

/** entry.id só serve se for id de verdade. "0" é o payload de exemplo do botão Teste. */
function validAccountId(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s && s !== "0" ? s : null;
}

function parse(body: Record<string, unknown>): SocialItem[] {
  const out: SocialItem[] = [];
  const object = String(body.object ?? "");
  const provider: "instagram" | "facebook" = object === "instagram" ? "instagram" : "facebook";
  const entries = Array.isArray(body.entry) ? (body.entry as Record<string, unknown>[]) : [];

  for (const entry of entries) {
    const entryAccount = validAccountId(entry.id);

    // --- DMs
    for (const m of (entry.messaging as Record<string, unknown>[] | undefined) ?? []) {
      const msg = m.message as Record<string, unknown> | undefined;
      if (!msg || msg.is_echo || msg.is_deleted) continue; // eco = mensagem nossa
      const text = String(msg.text ?? "").trim();
      if (!text) continue; // anexo puro: sem texto não há o que classificar
      const sender = (m.sender as { id?: string } | undefined)?.id ?? null;
      // Em DM o destinatário É a conta da marca — mais confiável que entry.id.
      const recipient = validAccountId((m.recipient as { id?: string } | undefined)?.id);
      const accountId = recipient ?? entryAccount;
      if (!sender || (accountId && sender === accountId)) continue;
      out.push({
        provider, surface: "dm", accountId,
        externalId: String(msg.mid ?? `${sender}-${m.timestamp ?? Date.now()}`),
        threadId: sender, authorId: sender, text,
        debug: { entryId: entry.id ?? null, recipient: recipient ?? null },
      });
    }

    // --- Comentários
    for (const ch of (entry.changes as Record<string, unknown>[] | undefined) ?? []) {
      const field = String(ch.field ?? "");
      const v = (ch.value ?? {}) as Record<string, unknown>;

      if (provider === "instagram" && (field === "comments" || field === "live_comments" || field === "mentions")) {
        const from = v.from as { id?: string } | undefined;
        const text = String(v.text ?? "").trim();
        if (!text) continue;
        const media = (v.media as { id?: string } | undefined)?.id ?? String(v.media_id ?? "");
        const mediaOwner = validAccountId(((v.media as Record<string, unknown> | undefined)?.owner as { id?: string } | undefined)?.id);
        const accountId = entryAccount ?? mediaOwner;
        if (from?.id && accountId && from.id === accountId) continue; // comentário da própria marca
        out.push({
          provider, surface: "comment", accountId,
          externalId: String(v.id ?? v.comment_id ?? ""),
          threadId: media || String(v.id ?? ""), authorId: from?.id ?? null, text,
          debug: { entryId: entry.id ?? null, field, mediaId: media || null, mediaOwner: mediaOwner ?? null },
        });
      }

      if (provider === "facebook" && field === "feed" && v.item === "comment" && v.verb === "add") {
        const from = v.from as { id?: string } | undefined;
        const text = String(v.message ?? "").trim();
        if (!text) continue;
        if (from?.id && entryAccount && from.id === entryAccount) continue;
        out.push({
          provider, surface: "comment", accountId: entryAccount,
          externalId: String(v.comment_id ?? ""),
          threadId: String(v.post_id ?? v.comment_id ?? ""), authorId: from?.id ?? null, text,
          debug: { entryId: entry.id ?? null, field, postId: v.post_id ?? null },
        });
      }
    }
  }
  return out.filter((i) => i.externalId);
}

/* ------------------------------------------------------------- ingestão */

export async function POST(req: Request) {
  const raw = await req.text();
  const admin = supabaseAdmin();

  /**
   * Marca a invocação ANTES de validar assinatura ou parsear.
   * Sem isso não dá para distinguir "a Meta nunca chamou" de "chamou e caiu cedo":
   * um 401 de assinatura não deixa rastro nenhum no banco.
   */
  const assinaturaHeader = req.headers.get("x-hub-signature-256");
  const { data: hit } = await admin
    .from("meta_hits")
    .insert({ bytes: raw.length, has_signature: Boolean(assinaturaHeader), outcome: "recebido" })
    .select("id")
    .single();
  const fecha = (patch: Record<string, unknown>) =>
    hit?.id ? admin.from("meta_hits").update(patch).eq("id", hit.id) : Promise.resolve();

  let assinado = false;
  try { assinado = verifySignature(raw, assinaturaHeader); } catch { assinado = false; }
  if (!assinado) {
    await fecha({ signature_ok: false, outcome: "assinatura inválida" });
    return new Response("assinatura inválida", { status: 401 });
  }

  // A partir daqui sempre devolvemos 200: reentrega do Meta em erro nosso só gera fila presa.
  let body: Record<string, unknown>;
  let itens: SocialItem[] = [];
  try {
    body = JSON.parse(raw);
    itens = parse(body);
  } catch {
    await fecha({ signature_ok: true, outcome: "payload ilegível" });
    return NextResponse.json({ ok: true, ignorado: "payload ilegível" });
  }

  await fecha({
    signature_ok: true, object: String(body.object ?? ""),
    entries: Array.isArray(body.entry) ? body.entry.length : 0, items: itens.length,
    outcome: itens.length ? "processando" : "nenhum item extraído",
  });

  let gravados = 0;
  const problemas: string[] = [];

  for (const it of itens) {
    const resolved = await resolveConnection(admin, it);
    if (!resolved) {
      problemas.push("conta não identificada");
      // Registra mesmo sem conexão, para o evento não sumir sem rastro.
      await admin.from("meta_events").insert({
        provider: it.provider, event_id: it.externalId, object_id: it.accountId, kind: it.surface,
        status: "ignorado", error: "não consegui identificar a conta", debug: it.debug,
        processed_at: new Date().toISOString(),
      });
      continue;
    }
    const { data: sec } = await admin.from("channel_secrets").select("access_token").eq("connection_id", resolved.conn.id).maybeSingle();
    const r = await ingestItem(admin, resolved.conn, it, { origem: "webhook", token: sec?.access_token });
    if (r === "novo") gravados++;
    if (r === "erro") problemas.push("falha ao gravar");
  }

  if (itens.length) {
    await fecha({
      outcome: gravados ? `gravados ${gravados}/${itens.length}` : "nada gravado",
      detail: problemas.length ? problemas.join(" · ").slice(0, 400) : null,
    });
  }

  return NextResponse.json({ ok: true, recebidos: itens.length, gravados });
}
