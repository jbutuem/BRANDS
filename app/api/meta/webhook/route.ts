import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifySignature, permalink } from "@/lib/meta";
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
  /** conta que recebeu (IG user id ou page id) — casa com channel_connections.external_id */
  accountId: string;
  /** id do comentário ou mid da DM — idempotência e alvo da publicação */
  externalId: string;
  /** agrupa o atendimento: id da mídia/post (comentário) ou id do remetente (DM) */
  threadId: string;
  authorId: string | null;
  text: string;
};

function parse(body: Record<string, unknown>): Item[] {
  const out: Item[] = [];
  const object = String(body.object ?? "");
  const provider: "instagram" | "facebook" = object === "instagram" ? "instagram" : "facebook";
  const entries = Array.isArray(body.entry) ? (body.entry as Record<string, unknown>[]) : [];

  for (const entry of entries) {
    const accountId = String(entry.id ?? "");
    if (!accountId) continue;

    // --- DMs (IG Messaging e Messenger têm o mesmo formato)
    for (const m of (entry.messaging as Record<string, unknown>[] | undefined) ?? []) {
      const msg = m.message as Record<string, unknown> | undefined;
      if (!msg || msg.is_echo || msg.is_deleted) continue; // eco = mensagem nossa
      const text = String(msg.text ?? "").trim();
      if (!text) continue; // anexo puro: sem texto não há o que classificar
      const sender = (m.sender as { id?: string } | undefined)?.id ?? null;
      if (!sender || sender === accountId) continue;
      out.push({
        provider, surface: "dm", accountId,
        externalId: String(msg.mid ?? `${sender}-${m.timestamp ?? Date.now()}`),
        threadId: sender, authorId: sender, text,
      });
    }

    // --- Comentários
    for (const ch of (entry.changes as Record<string, unknown>[] | undefined) ?? []) {
      const field = String(ch.field ?? "");
      const v = (ch.value ?? {}) as Record<string, unknown>;

      if (provider === "instagram" && (field === "comments" || field === "mentions")) {
        const from = v.from as { id?: string } | undefined;
        if (from?.id && from.id === accountId) continue; // comentário da própria marca
        const text = String(v.text ?? "").trim();
        if (!text) continue;
        const media = (v.media as { id?: string } | undefined)?.id ?? String(v.media_id ?? "");
        out.push({
          provider, surface: "comment", accountId,
          externalId: String(v.id ?? v.comment_id ?? ""),
          threadId: media || String(v.id ?? ""), authorId: from?.id ?? null, text,
        });
      }

      if (provider === "facebook" && field === "feed" && v.item === "comment" && v.verb === "add") {
        const from = v.from as { id?: string } | undefined;
        if (from?.id && from.id === accountId) continue;
        const text = String(v.message ?? "").trim();
        if (!text) continue;
        out.push({
          provider, surface: "comment", accountId,
          externalId: String(v.comment_id ?? ""),
          threadId: String(v.post_id ?? v.comment_id ?? ""), authorId: from?.id ?? null, text,
        });
      }
    }
  }
  return out.filter((i) => i.externalId && i.accountId);
}

/* ------------------------------------------------------------- ingestão */

export async function POST(req: Request) {
  const raw = await req.text();

  let assinado = false;
  try { assinado = verifySignature(raw, req.headers.get("x-hub-signature-256")); } catch { assinado = false; }
  if (!assinado) return new Response("assinatura inválida", { status: 401 });

  // A partir daqui sempre devolvemos 200: reentrega do Meta em erro nosso só gera fila presa.
  const admin = supabaseAdmin();
  let itens: Item[] = [];
  try { itens = parse(JSON.parse(raw)); } catch { return NextResponse.json({ ok: true, ignorado: "payload ilegível" }); }

  for (const it of itens) {
    // 1. Idempotência: o Meta reentrega o mesmo evento com frequência.
    const { error: dup } = await admin.from("meta_events").insert({
      provider: it.provider, event_id: it.externalId, object_id: it.accountId, kind: it.surface,
    });
    if (dup) continue; // 23505 = já processado

    try {
      // 2. Conta -> marca
      const { data: conn } = await admin
        .from("channel_connections")
        .select("id, brand_id, page_id, ig_user_id, status")
        .eq("provider", it.provider)
        .eq("external_id", it.accountId)
        .maybeSingle();
      if (!conn) {
        await admin.from("meta_events").update({ status: "ignorado", error: "conta sem conexão cadastrada", processed_at: new Date().toISOString() })
          .eq("provider", it.provider).eq("event_id", it.externalId);
        continue;
      }

      // 3. Scrubber ANTES de gravar. Texto bruto não encosta no banco.
      const s = scrubRegex(it.text);

      // 4. Reaproveita o atendimento: DM agrupa por remetente; comentário agrupa por post.
      let conversationId: string | null = null;
      const { data: existing } = await admin
        .from("conversations")
        .select("id")
        .eq("brand_id", conn.brand_id)
        .eq("external_thread_id", it.threadId)
        .eq("surface", it.surface)
        .in("status", ["aberta", "respondida"])
        .order("last_activity", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      // Comentário: só reaproveita se for o mesmo autor no mesmo post; senão vira atendimento novo.
      if (existing && it.surface === "dm") conversationId = existing.id;
      if (existing && it.surface === "comment") {
        const { data: sameAuthor } = await admin
          .from("conversations").select("id")
          .eq("brand_id", conn.brand_id).eq("external_thread_id", it.threadId).eq("surface", "comment")
          .eq("external_author_id", it.authorId ?? "").in("status", ["aberta", "respondida"])
          .order("last_activity", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
        if (sameAuthor) conversationId = sameAuthor.id;
      }

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

      await admin.from("channel_connections").update({ last_event_at: new Date().toISOString(), last_error: null }).eq("id", conn.id);
      await admin.from("meta_events").update({ status: "processado", brand_id: conn.brand_id, processed_at: new Date().toISOString() })
        .eq("provider", it.provider).eq("event_id", it.externalId);
    } catch (e) {
      await admin.from("meta_events").update({
        status: "erro", error: (e instanceof Error ? e.message : String(e)).slice(0, 400), processed_at: new Date().toISOString(),
      }).eq("provider", it.provider).eq("event_id", it.externalId);
    }
  }

  return NextResponse.json({ ok: true, recebidos: itens.length });
}
