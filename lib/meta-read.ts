/**
 * Leitura da Instagram Graph API para a varredura.
 *
 * Tudo aqui roda em Standard Access: a doc de comment moderation diz que basta
 * para contas profissionais que você controla e adicionou ao painel do app.
 * É o motivo de a varredura funcionar hoje e o webhook de `comments` não —
 * aquele exige Advanced Access.
 */
import { GRAPH_IG } from "./meta";

export class RateLimited extends Error {
  constructor(public retryAfter: number | null) {
    super("rate limit da Graph API");
  }
}

async function get<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${GRAPH_IG}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (res.status === 429) {
    const ra = res.headers.get("retry-after");
    throw new RateLimited(ra ? Number(ra) : null);
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok) {
    // Código 4 e 17 também são limite de uso, só que sinalizados no corpo.
    if (json.error?.code === 4 || json.error?.code === 17) throw new RateLimited(null);
    throw new Error(`Graph ${res.status}: ${json.error?.message ?? "erro desconhecido"}`);
  }
  return json as T;
}

export type Media = { id: string; timestamp?: string; comments_count?: number; permalink?: string };

/** Mídias recentes da conta, da mais nova para a mais antiga. */
export async function listMedia(igUserId: string, token: string, limit = 25): Promise<Media[]> {
  const r = await get<{ data?: Media[] }>(`/${igUserId}/media`, token, {
    fields: "id,timestamp,comments_count,permalink",
    limit: String(limit),
  });
  return r.data ?? [];
}

export type Comment = {
  id: string;
  text?: string;
  timestamp?: string;
  username?: string;
  from?: { id?: string; username?: string };
  replies?: { data?: Comment[] };
};

/** Comentários de uma mídia, incluindo as respostas aninhadas. */
export async function listComments(mediaId: string, token: string, limit = 50): Promise<Comment[]> {
  const r = await get<{ data?: Comment[] }>(`/${mediaId}/comments`, token, {
    fields: "id,text,timestamp,username,from,replies{id,text,timestamp,username,from}",
    limit: String(limit),
  });
  const flat: Comment[] = [];
  for (const c of r.data ?? []) {
    flat.push(c);
    for (const r2 of c.replies?.data ?? []) flat.push(r2);
  }
  return flat;
}

export type Conversation = { id: string; updated_time?: string; participants?: { data?: Array<{ id: string; username?: string }> } };

export async function listConversations(token: string, limit = 25): Promise<Conversation[]> {
  const r = await get<{ data?: Conversation[] }>("/me/conversations", token, {
    fields: "id,updated_time,participants",
    limit: String(limit),
  });
  return r.data ?? [];
}

export type DmMessage = { id: string; message?: string; created_time?: string; from?: { id?: string; username?: string } };

export async function conversationMessages(conversationId: string, token: string, limit = 25): Promise<DmMessage[]> {
  const r = await get<{ messages?: { data?: DmMessage[] } }>(`/${conversationId}`, token, {
    fields: `messages.limit(${limit}){id,from,message,created_time}`,
  });
  return r.messages?.data ?? [];
}
