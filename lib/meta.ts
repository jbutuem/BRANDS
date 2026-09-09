/**
 * Integração Instagram — Business Login for Instagram
 * ("Instagram API with Instagram Login", produto configurado no app Brands).
 *
 * Este fluxo NÃO passa por Página do Facebook. Consequências:
 *  - autorização em api.instagram.com/oauth/authorize (não facebook.com/dialog/oauth)
 *  - nenhuma permissão pages_* — elas são rejeitadas como Invalid Scopes aqui
 *  - todas as chamadas de API usam host graph.instagram.com
 *  - client_id/client_secret são os do INSTAGRAM app, não os do app Facebook
 *
 * Regras de ouro (mantidas):
 *  - Token nunca em channel_connections (legível por membros da marca). Vai para channel_secrets.
 *  - Texto recebido passa por scrubRegex ANTES de virar linha em messages.
 *  - Publicação é sempre disparada por um operador humano.
 */
import crypto from "node:crypto";

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v26.0";

/** Host das chamadas autenticadas com Instagram User access token. */
export const GRAPH_IG = `https://graph.instagram.com/${GRAPH_VERSION}`;
/** Host legado, só para conexões criadas via Facebook Login (nenhuma hoje). */
export const GRAPH_FB = `https://graph.facebook.com/${GRAPH_VERSION}`;

const IG_AUTHORIZE = "https://api.instagram.com/oauth/authorize";
const IG_TOKEN = "https://api.instagram.com/oauth/access_token";
const IG_LONG_TOKEN = "https://graph.instagram.com/access_token";
const IG_REFRESH = "https://graph.instagram.com/refresh_access_token";

/** Escopos do Business Login for Instagram — precisam bater com o configurado no app. */
export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
].join(",");

/** Campos de webhook assinados por conta. */
export const IG_WEBHOOK_FIELDS = ["comments", "live_comments", "messages", "message_reactions", "messaging_postbacks"];

type GraphErrorBody = {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
  error_type?: string;
  error_message?: string;
};

function graphError(status: number, json: GraphErrorBody) {
  const e = json.error;
  const msg = e?.message ?? json.error_message ?? "erro desconhecido";
  const code = e?.code ? ` [code ${e.code}${e.error_subcode ? "/" + e.error_subcode : ""}]` : "";
  return new Error(`Graph ${status}: ${msg}${code}`);
}

async function graph<T>(
  base: string,
  path: string,
  opts: { token?: string; params?: Record<string, string>; method?: "GET" | "POST" | "DELETE"; body?: unknown } = {}
): Promise<T> {
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, v);
  if (opts.token) url.searchParams.set("access_token", opts.token);

  const res = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    cache: "no-store",
    ...(opts.body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(opts.body) } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
  if (!res.ok) throw graphError(res.status, json);
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

export const STATE_MAX_AGE_MS = 10 * 60 * 1000;

/** state assinado: leva a marca e o usuário, expira em 10 min. Evita CSRF no callback. */
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
  const u = new URL(IG_AUTHORIZE);
  u.searchParams.set("client_id", appId());
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("state", state);
  u.searchParams.set("scope", IG_SCOPES);
  u.searchParams.set("response_type", "code");
  return u.toString();
}

export type IgToken = { token: string; userId: string; expiresIn: number | null; permissions: string[] };

/**
 * code -> token curto (form-encoded, não query string) -> token longo de 60 dias.
 * O code chega com "#_" no fim; precisa ser removido antes da troca.
 */
export async function exchangeCode(rawCode: string): Promise<IgToken> {
  const code = rawCode.replace(/#_$/, "");

  const form = new URLSearchParams({
    client_id: appId(),
    client_secret: appSecret(),
    grant_type: "authorization_code",
    redirect_uri: redirectUri(),
    code,
  });
  const res = await fetch(IG_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  });
  const short = (await res.json().catch(() => ({}))) as {
    access_token?: string; user_id?: number | string; permissions?: string[] | string;
  } & GraphErrorBody;
  if (!res.ok || !short.access_token) throw graphError(res.status, short);

  const long = await graph<{ access_token: string; expires_in?: number }>(IG_LONG_TOKEN, "", {
    params: { grant_type: "ig_exchange_token", client_secret: appSecret() },
    token: short.access_token,
  });

  const perms = Array.isArray(short.permissions)
    ? short.permissions
    : typeof short.permissions === "string" ? short.permissions.split(",").filter(Boolean) : [];

  return {
    token: long.access_token,
    userId: String(short.user_id ?? ""),
    expiresIn: long.expires_in ?? null,
    permissions: perms,
  };
}

/** Renova o token longo. Válido enquanto tiver ao menos 24h de vida e a conta estiver ativa. */
export async function refreshToken(token: string) {
  return graph<{ access_token: string; expires_in?: number }>(IG_REFRESH, "", {
    params: { grant_type: "ig_refresh_token" },
    token,
  });
}

export type IgAccount = { id?: string; user_id?: string; username?: string; name?: string };

/** Conta conectada. Sem Página, sem /me/accounts — é uma conta só por autorização. */
export async function me(token: string): Promise<IgAccount> {
  return graph<IgAccount>(GRAPH_IG, "/me", { token, params: { fields: "user_id,username,name" } });
}

/** Assina o app nos webhooks desta conta. O app já tem os campos marcados no painel. */
export async function subscribe(token: string) {
  return graph<{ success: boolean }>(GRAPH_IG, "/me/subscribed_apps", {
    method: "POST",
    token,
    params: { subscribed_fields: IG_WEBHOOK_FIELDS.join(",") },
  });
}

export async function unsubscribe(token: string) {
  return graph<{ success: boolean }>(GRAPH_IG, "/me/subscribed_apps", { method: "DELETE", token });
}

/**
 * Este token enxerga este comentário?
 * Usado para descobrir a conta dona do evento quando o webhook vem sem entry.id
 * e há mais de uma conta conectada. Só o token da dona consegue ler o nó.
 */
export async function ownsComment(commentId: string, token: string): Promise<boolean> {
  try {
    const r = await graph<{ id?: string }>(GRAPH_IG, `/${commentId}`, { token, params: { fields: "id" } });
    return Boolean(r.id);
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------- Assinatura */

/**
 * x-hub-signature-256, com o app secret do Instagram.
 * Se META_APP_SECRET for o secret do app Facebook, isto falha em todo evento.
 */
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
  | { channel: "instagram"; surface: "dm"; recipientId: string }
  | { channel: "facebook"; surface: "comment"; commentId: string }
  | { channel: "facebook"; surface: "dm"; pageId: string; recipientId: string };

/** Publica a resposta aprovada. Devolve o id do item criado. */
export async function publish(target: PublishTarget, message: string, token: string): Promise<string> {
  if (target.channel === "instagram") {
    if (target.surface === "comment") {
      const r = await graph<{ id: string }>(GRAPH_IG, `/${target.commentId}/replies`, {
        method: "POST", token, params: { message },
      });
      return r.id;
    }
    // DM: o nó é sempre /me — o token já identifica a conta.
    const r = await graph<{ message_id: string }>(GRAPH_IG, "/me/messages", {
      method: "POST", token,
      body: { recipient: { id: target.recipientId }, message: { text: message } },
    });
    return r.message_id;
  }

  // Caminho legado por Página do Facebook. Nenhuma conexão usa hoje.
  if (target.surface === "comment") {
    const r = await graph<{ id: string }>(GRAPH_FB, `/${target.commentId}/comments`, {
      method: "POST", token, params: { message },
    });
    return r.id;
  }
  const r = await graph<{ message_id: string }>(GRAPH_FB, `/${target.pageId}/messages`, {
    method: "POST", token,
    body: { recipient: { id: target.recipientId }, message: { text: message }, messaging_type: "RESPONSE" },
  });
  return r.message_id;
}

/** Permalink da mídia — usado como external_url da conversa na Fila. */
export async function permalink(mediaId: string, token: string): Promise<string | null> {
  try {
    const r = await graph<{ permalink?: string }>(GRAPH_IG, `/${mediaId}`, { token, params: { fields: "permalink" } });
    return r.permalink ?? null;
  } catch {
    return null;
  }
}
