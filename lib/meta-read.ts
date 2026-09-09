/**
 * Leitura da Instagram Graph API para a varredura.
 *
 * Tudo aqui roda em Standard Access: basta para contas profissionais que a gente
 * controla e adicionou ao painel do app. É por isso que a varredura funciona hoje
 * e o webhook de `comments` não — aquele exige Advanced Access.
 *
 * Campos: o Instagram Login usa `username` no comentário, não o objeto `from` da
 * API antiga via Facebook Login, e não aceita o aninhamento replies{...}.
 * Pedir campo que não existe faz a Graph devolver lista vazia sem erro.
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
    // Códigos 4 e 17 também são limite de uso, sinalizados no corpo.
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
  parent_id?: string;
  /** id do autor quando a API devolver; no Instagram Login costuma vir só o username */
  from?: { id?: string; username?: string };
};

const COMMENT_FIELDS = "id,text,timestamp,username,parent_id";

/**
 * Comentários de uma mídia, já com as respostas de cada um.
 * As respostas vêm pela aresta /replies — o aninhamento inline não é aceito aqui.
 */
export async function listComments(
  mediaId: string,
  token: string,
  limit = 50
): Promise<{ comments: Comment[]; nota: string | null }> {
  const r = await get<{ data?: Comment[] }>(`/${mediaId}/comments`, token, {
    fields: COMMENT_FIELDS,
    limit: String(limit),
  });
  const top = r.data ?? [];
  const todos: Comment[] = [...top];

  for (const c of top) {
    try {
      const rr = await get<{ data?: Comment[] }>(`/${c.id}/replies`, token, { fields: COMMENT_FIELDS, limit: "25" });
      for (const reply of rr.data ?? []) todos.push(reply);
    } catch {
      // Sem respostas ou sem permissão para elas: o comentário principal já basta.
    }
  }
  return { comments: todos, nota: top.length ? null : "mídia com comentários mas a API devolveu lista vazia" };
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
