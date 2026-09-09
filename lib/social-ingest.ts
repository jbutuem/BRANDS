/**
 * Ingestão de item social (comentário ou DM) na Fila.
 *
 * Usado pelo webhook E pela varredura. Os dois caminhos precisam gravar do mesmo
 * jeito — se cada um tiver sua cópia, as regras de dedupe e de Scrubber divergem
 * e um dos dois passa a furar sem ninguém perceber.
 */
import { supabaseAdmin } from "./supabase/admin";
import { permalink, ownsComment } from "./meta";
import { scrubRegex } from "./scrub";

type Admin = ReturnType<typeof supabaseAdmin>;

export type SocialItem = {
  provider: "instagram" | "facebook";
  surface: "dm" | "comment";
  /** Conta que recebeu. Nulo quando o payload não diz (ex.: entry.id = "0"). */
  accountId: string | null;
  /** id do comentário ou da mensagem — chave de idempotência e alvo da resposta */
  externalId: string;
  /** agrupa o atendimento: mídia (comentário) ou remetente (DM) */
  threadId: string;
  authorId: string | null;
  text: string;
  /** permalink já conhecido, evita uma chamada extra */
  url?: string | null;
  debug?: Record<string, unknown>;
};

export type Conn = { id: string; brand_id: string; external_id: string; ig_user_id: string | null; page_id: string | null };

/**
 * Descobre a que conexão o evento pertence.
 *  1. pelo id do payload  2. conexão única ativa  3. sondagem: só o token da dona lê o comentário
 */
export async function resolveConnection(admin: Admin, it: SocialItem): Promise<{ conn: Conn; how: string } | null> {
  if (it.accountId) {
    const { data } = await admin
      .from("channel_connections")
      .select("id, brand_id, external_id, ig_user_id, page_id")
      .eq("provider", it.provider)
      .eq("external_id", it.accountId)
      .maybeSingle();
    if (data) return { conn: data as Conn, how: "external_id" };
  }

  const { data: ativas } = await admin
    .from("channel_connections")
    .select("id, brand_id, external_id, ig_user_id, page_id")
    .eq("provider", it.provider)
    .eq("status", "active");
  const conns = (ativas ?? []) as Conn[];
  if (!conns.length) return null;
  if (conns.length === 1) return { conn: conns[0], how: "única conexão ativa" };

  if (it.provider === "instagram" && it.surface === "comment") {
    for (const c of conns) {
      const { data: sec } = await admin.from("channel_secrets").select("access_token").eq("connection_id", c.id).maybeSingle();
      if (!sec?.access_token) continue;
      if (await ownsComment(it.externalId, sec.access_token)) return { conn: c, how: "sondagem de token" };
    }
  }
  return null;
}

export type IngestResult = "novo" | "duplicado" | "erro";

/**
 * Grava o item na Fila. Idempotente por (provider, externalId) via meta_events —
 * é o que faz webhook e varredura poderem ver o mesmo comentário sem duplicar.
 */
export async function ingestItem(
  admin: Admin,
  conn: Conn,
  it: SocialItem,
  opts: { origem: string; token?: string }
): Promise<IngestResult> {
  const { error: dup } = await admin.from("meta_events").insert({
    provider: it.provider, event_id: it.externalId, object_id: conn.external_id, kind: it.surface,
  });
  if (dup) return "duplicado"; // 23505 = já visto

  const marcar = (patch: Record<string, unknown>) =>
    admin.from("meta_events").update({ ...patch, processed_at: new Date().toISOString() })
      .eq("provider", it.provider).eq("event_id", it.externalId);

  try {
    // Scrubber ANTES de gravar. Texto bruto não encosta no banco.
    const s = scrubRegex(it.text);

    // Reaproveita o atendimento: DM agrupa por remetente; comentário por mídia + autor.
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

    let conversationId = existing?.id ?? null;

    if (!conversationId) {
      let url = it.url ?? null;
      if (!url && it.surface === "comment" && opts.token) url = await permalink(it.threadId, opts.token);
      const { data: conv, error } = await admin.from("conversations").insert({
        brand_id: conn.brand_id, channel: it.provider, surface: it.surface, status: "aberta",
        source: opts.origem, channel_connection_id: conn.id,
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
    await marcar({ status: "processado", brand_id: conn.brand_id });
    return "novo";
  } catch (e) {
    await marcar({ status: "erro", error: (e instanceof Error ? e.message : String(e)).slice(0, 400), debug: it.debug });
    return "erro";
  }
}
