import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifySignature, permalink, ownsComment } from "@/lib/meta";
import { scrubRegex } from "@/lib/scrub";

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

/* ------------------------------------------------------------- tipos Meta */

type Item = {
  provider: "instagram" | "facebook";
  surface: "dm" | "comment";
  /** Conta que recebeu. Pode vir nulo — o payload de teste do painel manda entry.id = "0". */
  accountId: string | null;
  externalId: string;
  threadId: string;
  authorId: string | null;
  text: string;
  /** esqueleto sem texto, guardado só quando o evento não resolve */
  debug: Record<string, unknown>;
};

/** entry.id só serve se for id de verdade. "0" é o payload de exemplo do botão Teste. */
function validAccountId(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s && s !== "0" ? s : null;
}

function parse(body: Record<string, unknown>): Item[] {
  const out: Item[] = [];
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
          debug: { entryId: entry.id ?? null, field, mediaId: media || null, mediaOwner: mediaOwner ?? null, parentId: v.parent_id ?? null },
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

/* --------------------------------------------------- resolução da conta */

type Conn = { id: string; brand_id: string; page_id: string | null; ig_user_id: string | null; external_id: string };

async function resolveConnection(
  admin: ReturnType<typeof supabaseAdmin>,
  it: Item
): Promise<{ conn: Conn; how: string } | null> {
  if (it.accountId) {
    const { data } = await admin
      .from("channel_connections")
      .select("id, brand_id, page_id, ig_user_id, external_id")
      .eq("provider", it.provider)
      .eq("external_id", it.accountId)
      .maybeSingle();
    if (data) return { conn: data as Conn, how: "external_id" };
  }

  const { data: ativas } = await admin
    .from("channel_connections")
    .select("id, brand_id, page_id, ig_user_id, external_id")
    .eq("provider", it.provider)
    .eq("status", "active");
  const conns = (ativas ?? []) as Conn[];
  if (!conns.length) return null;
  if (conns.length === 1) return { conn: conns[0], how: "única conexão ativa" };

  // Várias contas conectadas: só o token da dona consegue ler o comentário.
  if (it.provider === "instagram" && it.surface === "comment") {
    for (const c of conns) {
      const { data: sec } = await admin.from("channel_secrets").select("access_token").eq("connection_id", c.id).maybeSingle();
      if (!sec?.access_token) continue;
      if (await ownsComment(it.externalId, sec.access_token)) return { conn: c, how: "sondagem de token" };
    }
  }
  return null;
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
  let itens: Item[] = [];
  try {
    body = JSON.parse(raw);
    itens = parse(body);
  } catch {
    await fecha({ signature_ok: true, outcome: "payload ilegível" });
    return NextResponse.json({ ok: true, ignorado: "payload ilegível" });
  }

  const entriesCount = Array.isArray(body.entry) ? body.entry.length : 0;
  await fecha({
    signature_ok: true, object: String(body.object ?? ""), entries: entriesCount, items: itens.length,
    outcome: itens.length ? "processando" : "nenhum item extraído",
  });

  let gravados = 0;
  const problemas: string[] = [];

  for (const it of itens) {
    // Idempotência: o Meta reentrega o mesmo evento com frequência.
    const { error: dup } = await admin.from("meta_events").insert({
      provider: it.provider, event_id: it.externalId, object_id: it.accountId, kind: it.surface,
    });
    if (dup) continue; // 23505 = já processado

    const marcar = (patch: Record<string, unknown>) =>
      admin.from("meta_events").update({ ...patch, processed_at: new Date().toISOString() })
        .eq("provider", it.provider).eq("event_id", it.externalId);

    try {
      const resolved = await resolveConnection(admin, it);
      if (!resolved) {
        problemas.push("conta não identificada");
        await marcar({ status: "ignorado", error: "não consegui identificar a conta", debug: it.debug });
        continue;
      }
      const conn = resolved.conn;

      // Scrubber ANTES de gravar. Texto bruto não encosta no banco.
      const s = scrubRegex(it.text);

      // Reaproveita o atendimento: DM agrupa por remetente; comentário por post + autor.
      let conversationId: string | null = null;
      const base = admin
        .from("conversations")
        .select("id")
        .eq("brand_id", conn.brand_id)
        .eq("external_thread_id", it.threadId)
        .eq("surface", it.surface)
        .in("status", ["aberta", "respondida"]);
      const { data: existing } = await (it.surface === "comment" && it.authorId
        ? base.eq("external_author_id", it.authorId)
        : base
      ).order("last_activity", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      if (existing) conversationId = existing.id;

      if (!conversationId) {
        let url: string | null = null;
        if (it.surface === "comment") {
          const { data: sec } = await admin.from("channel_secrets").select("access_token").eq("connection_id", conn.id).maybeSingle();
          if (sec?.access_token) url = await permalink(it.threadId, sec.access_token);
        }
        const { data: conv, error } = await admin.from("conversations").insert({
          brand_id: conn.brand_id, channel: it.provider, surface: it.surface, status: "aberta",
          source: "webhook", channel_connection_id: conn.id,
          external_thread_id: it.threadId, external_author_id: it.authorId, external_url: url,
          summary: s.text.slice(0, 140), last_activity: new Date().toISOString(),
        }).select("id").single();
        if (error) throw new Error(error.message);
        conversationId = conv.id;
      } else {
        await admin.from("conversations")
          .update({ status: "aberta", last_activity: new Date().toISOString(), published_at: null })
          .eq("id", conversationId);
      }

      const { error: merr } = await admin.from("messages").insert({
        conversation_id: conversationId, brand_id: conn.brand_id, direction: "in",
        content: s.text, scrub_report: s.report, external_id: it.externalId,
      });
      if (merr && merr.code !== "23505") throw new Error(merr.message);

      await admin.from("channel_connections")
        .update({ last_event_at: new Date().toISOString(), last_error: null })
        .eq("id", conn.id);
      await marcar({
        status: "processado", brand_id: conn.brand_id, object_id: conn.external_id,
        error: resolved.how === "external_id" ? null : `resolvido por ${resolved.how}`,
      });
      gravados++;
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 400);
      problemas.push(msg);
      await marcar({ status: "erro", error: msg, debug: it.debug });
    }
  }

  if (itens.length) {
    await fecha({
      outcome: gravados ? `gravados ${gravados}/${itens.length}` : "nada gravado",
      detail: problemas.length ? problemas.join(" · ").slice(0, 400) : null,
    });
  }

  return NextResponse.json({ ok: true, recebidos: itens.length, gravados });
}
