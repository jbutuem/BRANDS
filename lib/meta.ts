/**
 * Integração Meta (Instagram + Facebook Page) — cliente Graph API.
 *
 * Regras de ouro:
 *  - Nenhum token vive em channel_connections (tabela legível por membros da marca).
 *    Tokens ficam em listening.channel_secrets, sem policy de RLS -> só service_role.
 *  - Todo texto que entra passa por scrubRegex ANTES de virar linha em messages.
 *  - Publicação é sempre disparada por um operador humano. Nada sai sozinho.
 */
import crypto from "node:crypto";

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v26.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Escopos pedidos no Facebook Login for Business. */
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_manage_engagement",
  "pages_messaging",
  "instagram_basic",
  "instagram_manage_comments",
  "instagram_manage_messages",
  "business_management",
].join(",");

/** Campos de webhook assinados por página. */
export const PAGE_WEBHOOK_FIELDS = ["feed", "messages", "messaging_postbacks", "mention"];

type GraphErrorBody = { error?: { message?: string; type?: string; code?: number; error_subcode?: number } };

async function graph<T>(
  path: string,
  opts: { token?: string; params?: Record<string, string>; method?: "GET" | "POST" | "DELETE"; body?: unknown } = {}
): Promise<T> {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, v);
  if (opts.token) url.searchParams.set("access_token", opts.token);

  const res = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    cache: "no-store",
    ...(opts.body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(opts.body) } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
  if (!res.ok) {
    const e = json.error;
    throw new Error(`Graph ${res.status}: ${e?.message ?? "erro desconhecido"}${e?.code ? ` [code ${e.code}${e.error_subcode ? "/" + e.error_subcode : ""}]` : ""}`);
  }
  return json as T;
}

/* ---------------------------------------------------------------- OAuth */

export function appId() {
  const v = process.env.META_APP_ID;
  if (!v) throw new Error("META_APP_ID não configurado");
  return v;
}
export function appSecret() {
  const v = process.env.META_APP_SECRET;
  if (!v) throw new Error("META_APP_SECRET não configurado");
  return v;
}
export function redirectUri() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL não configurado");
  return `${base.replace(/\/$/, "")}/api/meta/oauth/callback`;
}

/** state assinado: leva a marca ativa e o usuário, e expira em 10 min. Evita CSRF no callback. */
export const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function signState(brandId: string, userId: string) {
  const payload = `${brandId}.${userId}.${Date.now()}`;
  const sig = crypto.createHmac("sha256", appSecret()).update(payload).digest("hex").slice(0, 32);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function readState(state: string): { brandId: string; userId: string } | null {
  try {
    const [brandId, userId, ts, sig] = Buffer.from(state, "base64url").toString("utf8").split(".");
    if (!brandId || !userId || !ts || !sig) return null;
    const expected = crypto.createHmac("sha256", appSecret()).update(`${brandId}.${userId}.${ts}`).digest("hex").slice(0, 32);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    if (Date.now() - Number(ts) > STATE_MAX_AGE_MS) return null;
    return { brandId, userId };
  } catch {
    return null;
  }
}

export function authorizeUrl(state: string) {
  const u = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set("client_id", appId());
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("state", state);
  u.searchParams.set("scope", META_SCOPES);
  u.searchParams.set("response_type", "code");
  return u.toString();
}

/** code -> user token curto -> user token longo (60 dias). */
export async function exchangeCode(code: string): Promise<{ token: string; expiresIn: number | null }> {
  const short = await graph<{ access_token: string }>("/oauth/access_token", {
    params: { client_id: appId(), client_secret: appSecret(), redirect_uri: redirectUri(), code },
  });
  const long = await graph<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
    params: { grant_type: "fb_exchange_token", client_id: appId(), client_secret: appSecret(), fb_exchange_token: short.access_token },
  });
  return { token: long.access_token, expiresIn: long.expires_in ?? null };
}

export type MetaPage = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
};

/** Páginas que o usuário administra, com o token DE PÁGINA (não expira quando vem de user token longo). */
export async function listPages(userToken: string): Promise<MetaPage[]> {
  const r = await graph<{ data: MetaPage[] }>("/me/accounts", {
    token: userToken,
    params: { fields: "id,name,access_token,instagram_business_account{id,username}", limit: "100" },
  });
  return r.data ?? [];
}

/** Assina o app nos webhooks da página. Sem isso, nada chega. */
export async function subscribePage(pageId: string, pageToken: string) {
  return graph<{ success: boolean }>(`/${pageId}/subscribed_apps`, {
    method: "POST",
    token: pageToken,
    params: { subscribed_fields: PAGE_WEBHOOK_FIELDS.join(",") },
  });
}

export async function unsubscribePage(pageId: string, pageToken: string) {
  return graph<{ success: boolean }>(`/${pageId}/subscribed_apps`, { method: "DELETE", token: pageToken });
}

/* ----------------------------------------------------------- Assinatura */

/** x-hub-signature-256. Sem isso qualquer um posta no nosso webhook. */
export function verifySignature(rawBody: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret()).update(rawBody, "utf8").digest("hex");
  const got = header.slice(7);
  if (got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
}

/* ---------------------------------------------------------- Publicação */

export type PublishTarget =
  | { channel: "instagram"; surface: "comment"; commentId: string }
  | { channel: "instagram"; surface: "dm"; igUserId: string; recipientId: string }
  | { channel: "facebook"; surface: "comment"; commentId: string }
  | { channel: "facebook"; surface: "dm"; pageId: string; recipientId: string };

/** Publica a resposta aprovada. Devolve o id do item criado no Meta. */
export async function publish(target: PublishTarget, message: string, pageToken: string): Promise<string> {
  if (target.surface === "comment") {
    const path = target.channel === "instagram" ? `/${target.commentId}/replies` : `/${target.commentId}/comments`;
    const r = await graph<{ id: string }>(path, { method: "POST", token: pageToken, params: { message } });
    return r.id;
  }
  const node = target.channel === "instagram" ? target.igUserId : target.pageId;
  const r = await graph<{ message_id: string }>(`/${node}/messages`, {
    method: "POST",
    token: pageToken,
    body: { recipient: { id: target.recipientId }, message: { text: message }, messaging_type: "RESPONSE" },
  });
  return r.message_id;
}

/** Permalink do post/mídia — usado como external_url da conversa na Fila. */
export async function permalink(mediaOrPostId: string, pageToken: string): Promise<string | null> {
  try {
    const r = await graph<{ permalink?: string; permalink_url?: string }>(`/${mediaOrPostId}`, {
      token: pageToken,
      params: { fields: "permalink,permalink_url" },
    });
    return r.permalink ?? r.permalink_url ?? null;
  } catch {
    return null;
  }
}
