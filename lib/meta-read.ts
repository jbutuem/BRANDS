/**
 * Leitura da Instagram Graph API para a varredura.
 *
 * Roda em Standard Access. O que travava a leitura não era o nível de acesso e sim
 * o Modo de Desenvolvimento do app — nele a API devolve `data: []` com cursores de
 * paginação preenchidos, sem erro nenhum. Com o app publicado, o conteúdo vem.
 */
import { GRAPH_IG } from "./meta";

export class RateLimited extends Error {
  constructor(public retryAfter: number | null) {
    super("rate limit da Graph API");
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 429) {
    const ra = res.headers.get("retry-after");
    throw new RateLimited(ra ? Number(ra) : null);
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok) {
    if (json.error?.code === 4 || json.error?.code === 17) throw new RateLimited(null);
    throw new Error(`Graph ${res.status}: ${json.error?.message ?? "erro desconhecido"}`);
  }
  return json as T;
}

function build(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${GRAPH_IG}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  return url.toString();
}

async function get<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  return fetchJson<T>(build(path, token, params));
}

type Paged<T> = { data?: T[]; paging?: { next?: string } };

/** Segue a paginação até o teto. `next` já vem com o token embutido. */
async function getAll<T>(path: string, token: string, params: Record<string, string>, max: number): Promise<T[]> {
  const out: T[] = [];
  let url: string | undefined = build(path, token, params);
  while (url && out.length < max) {
    const page: Paged<T> = await fetchJson<Paged<T>>(url);
    out.push(...(page.data ?? []));
    url = page.paging?.next;
  }
  return out.slice(0, max);
}

export type Media = { id: string; timestamp?: string; comments_count?: number; permalink?: string };

/**
 * Mídias da conta, da mais nova para a mais antiga, paginando até `max`.
 * Sem corte por idade: post antigo continua recebendo comentário novo.
 */
export async function listMedia(igUserId: string, token: string, max = 50): Promise<Media[]> {
  return getAll<Media>(`/${igUserId}/media`, token, { fields: "id,timestamp,comments_count,permalink", limit: "100" }, max);
}

export type Comment = {
  id: string;
  text?: string;
  timestamp?: string;
  username?: string;
  parent_id?: string;
  from?: { id?: string; username?: string };
  /** preenchido pela listComments: já existe resposta da própria marca neste comentário */
  jaRespondido?: boolean;
};

const COMMENT_FIELDS = "id,text,timestamp,username,parent_id";

function ehDaMarca(c: Comment, igId: string, handle: string): boolean {
  if (c.from?.id && c.from.id === igId) return true;
  const u = (c.username ?? c.from?.username ?? "").toLowerCase();
  return Boolean(u && handle && u === handle);
}

/**
 * Comentários de uma mídia, com as respostas de cada um.
 *
 * Marca como `jaRespondido` o comentário que já tem resposta da própria marca —
 * é o sinal de que alguém já atendeu, dentro ou fora do app. Sem isso a varredura
 * traria de volta tudo que a equipe já respondeu na mão.
 */
export async function listComments(
  mediaId: string,
  token: string,
  igId: string,
  handleProprio: string,
  max = 100
): Promise<{ comments: Comment[]; nota: string | null }> {
  const top = await getAll<Comment>(`/${mediaId}/comments`, token, { fields: COMMENT_FIELDS, limit: "50" }, max);
  const todos: Comment[] = [];

  for (const c of top) {
    let respostas: Comment[] = [];
    try {
      const rr = await get<{ data?: Comment[] }>(`/${c.id}/replies`, token, { fields: COMMENT_FIELDS, limit: "25" });
      respostas = rr.data ?? [];
    } catch {
      // Sem respostas ou sem permissão para elas: segue com o comentário principal.
    }
    const atendido = respostas.some((r) => ehDaMarca(r, igId, handleProprio));
    todos.push({ ...c, jaRespondido: atendido });
    // Resposta de terceiro dentro da thread também é interação a tratar.
    for (const r of respostas) todos.push({ ...r, jaRespondido: atendido });
  }
  return { comments: todos, nota: top.length ? null : "mídia com comentários mas a API devolveu lista vazia" };
}

export type Conversation = { id: string; updated_time?: string; participants?: { data?: Array<{ id: string; username?: string }> } };

export async function listConversations(token: string, max = 50): Promise<Conversation[]> {
  return getAll<Conversation>("/me/conversations", token, { fields: "id,updated_time,participants", limit: "50" }, max);
}

export type DmMessage = { id: string; message?: string; created_time?: string; from?: { id?: string; username?: string } };

/**
 * Mensagens de uma conversa, da mais recente para a mais antiga (ordem da API).
 * Quem chama usa a primeira para saber se a última palavra foi nossa.
 */
export async function conversationMessages(conversationId: string, token: string, limit = 25): Promise<DmMessage[]> {
  const r = await get<{ messages?: { data?: DmMessage[] } }>(`/${conversationId}`, token, {
    fields: `messages.limit(${limit}){id,from,message,created_time}`,
  });
  return r.messages?.data ?? [];
}
