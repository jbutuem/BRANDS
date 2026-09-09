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
  user?: { id?: string; username?: string };
  /** true = comentário da própria marca. Ver resolverAutoria. */
  daMarca?: boolean;
  /** já existe resposta da própria marca nesta thread */
  jaRespondido?: boolean;
};

/**
 * Campos do comentário, do mais rico ao mais pobre.
 *
 * Identificar o autor é o que separa comentário de cliente de resposta da própria
 * marca. Sem isso a varredura devolve as respostas da marca para a Fila e o
 * operador acaba respondendo a si mesmo — foi o que aconteceu na DaVinci.
 * A API nem sempre concede `from`/`user`, então tentamos em degraus e a primeira
 * tentativa que responder vence.
 */
const FIELD_TIERS = [
  "id,text,timestamp,username,parent_id,from{id,username}",
  "id,text,timestamp,username,parent_id,user{id,username}",
  "id,text,timestamp,username,parent_id",
];

async function commentsWithBestFields(path: string, token: string, limit: string, max: number): Promise<{ items: Comment[]; tier: number }> {
  let ultimoErro: unknown = null;
  for (let i = 0; i < FIELD_TIERS.length; i++) {
    try {
      const items = await getAll<Comment>(path, token, { fields: FIELD_TIERS[i], limit }, max);
      return { items, tier: i };
    } catch (e) {
      if (e instanceof RateLimited) throw e;
      ultimoErro = e; // campo não permitido: cai para o próximo degrau
    }
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error("falha ao ler comentários");
}

/** Autor do comentário, olhando todos os lugares onde a API pode ter colocado. */
export function autorDe(c: Comment): { id: string | null; handle: string } {
  return {
    id: c.from?.id ?? c.user?.id ?? null,
    handle: (c.username ?? c.from?.username ?? c.user?.username ?? "").toLowerCase(),
  };
}

function ehDaMarca(c: Comment, igId: string, handle: string): boolean {
  const a = autorDe(c);
  if (a.id) return a.id === igId;
  return Boolean(a.handle && handle && a.handle === handle);
}

/**
 * Comentários de uma mídia, com as respostas de cada um.
 * Marca `daMarca` (autoria) e `jaRespondido` (já existe resposta nossa na thread).
 */
export async function listComments(
  mediaId: string,
  token: string,
  igId: string,
  handleProprio: string,
  max = 100
): Promise<{ comments: Comment[]; nota: string | null; autoriaConfiavel: boolean }> {
  const { items: top, tier } = await commentsWithBestFields(`/${mediaId}/comments`, token, "50", max);
  // Degrau 2 = sem from nem user: só dá para comparar handle, e a API às vezes
  // omite username também. Nesse caso a autoria não é confiável.
  const autoriaConfiavel = tier < 2 || top.some((c) => c.username);
  const todos: Comment[] = [];

  for (const c of top) {
    let respostas: Comment[] = [];
    try {
      const rr = await commentsWithBestFields(`/${c.id}/replies`, token, "25", 25);
      respostas = rr.items;
    } catch {
      // Sem respostas ou sem permissão: segue com o comentário principal.
    }
    const atendido = respostas.some((r) => ehDaMarca(r, igId, handleProprio));
    todos.push({ ...c, daMarca: ehDaMarca(c, igId, handleProprio), jaRespondido: atendido });
    for (const r of respostas) todos.push({ ...r, daMarca: ehDaMarca(r, igId, handleProprio), jaRespondido: atendido });
  }
  return {
    comments: todos,
    nota: top.length ? null : "mídia com comentários mas a API devolveu lista vazia",
    autoriaConfiavel,
  };
}

export type Conversation = { id: string; updated_time?: string; participants?: { data?: Array<{ id: string; username?: string }> } };

export async function listConversations(token: string, max = 50): Promise<Conversation[]> {
  return getAll<Conversation>("/me/conversations", token, { fields: "id,updated_time,participants", limit: "50" }, max);
}

export type DmMessage = { id: string; message?: string; created_time?: string; from?: { id?: string; username?: string } };

/** Mensagens da conversa, da mais recente para a mais antiga (ordem da API). */
export async function conversationMessages(conversationId: string, token: string, limit = 25): Promise<DmMessage[]> {
  const r = await get<{ messages?: { data?: DmMessage[] } }>(`/${conversationId}`, token, {
    fields: `messages.limit(${limit}){id,from,message,created_time}`,
  });
  return r.messages?.data ?? [];
}
