import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { GRAPH_IG } from "@/lib/meta";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Diagnóstico da conexão Instagram. Protegido pelo mesmo SCAN_SECRET.
 *
 * Responde duas perguntas que a varredura não responde:
 *  1. quais escopos a Meta REALMENTE concedeu (não os que pedimos no OAuth)
 *  2. o que a API devolve para um post específico, sem janela de tempo
 *
 * Uso:
 *   GET /api/meta/diag                      -> escopos + conta + lista de mídias
 *   GET /api/meta/diag?media=<id>           -> comentários daquele post, cru
 *   GET /api/meta/diag?media=<id>&full=1    -> inclui o corpo da resposta
 *
 * O token nunca aparece na saída.
 */
function autorizado(req: Request) {
  const esperado = process.env.SCAN_SECRET;
  if (!esperado) return false;
  const h = req.headers.get("x-scan-secret") ?? new URL(req.url).searchParams.get("secret");
  return h === esperado;
}

/** Chama a Graph e devolve status + corpo, sem lançar — queremos ver o erro, não escondê-lo. */
async function probe(base: string, path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    return { path, status: res.status, body };
  } catch (e) {
    return { path, status: 0, body: { erro: e instanceof Error ? e.message : String(e) } };
  }
}

export async function GET(req: Request) {
  if (!autorizado(req)) return new Response("não autorizado", { status: 401 });

  const url = new URL(req.url);
  const mediaId = url.searchParams.get("media");
  const full = url.searchParams.get("full") === "1";

  const admin = supabaseAdmin();
  const { data: conn } = await admin
    .from("channel_connections")
    .select("id, display_name, external_id, ig_user_id")
    .eq("provider", "instagram")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!conn) return NextResponse.json({ erro: "nenhuma conexão ativa" }, { status: 404 });

  const { data: sec } = await admin.from("channel_secrets").select("access_token, scopes").eq("connection_id", conn.id).maybeSingle();
  if (!sec?.access_token) return NextResponse.json({ erro: "sem token" }, { status: 400 });
  const token = sec.access_token;
  const igId = conn.ig_user_id ?? conn.external_id;

  /* ---- 1. escopo REAL concedido, não o que pedimos ---- */
  // Nem todo endpoint de introspecção existe no Instagram Login; tentamos os três
  // e reportamos o que cada um responde, inclusive o erro.
  const escopos = await Promise.all([
    probe(GRAPH_IG, "/me/permissions", token),
    probe("https://graph.instagram.com", "/debug_token", token, { input_token: token }),
    probe(GRAPH_IG, "/me", token, { fields: "user_id,username,account_type,profile_picture_url" }),
  ]);

  /* ---- 2. leitura direta de um post, sem janela de tempo ---- */
  if (mediaId) {
    const detalhe = await probe(GRAPH_IG, `/${mediaId}`, token, { fields: "id,timestamp,comments_count,permalink,media_type,owner" });
    const comentarios = await probe(GRAPH_IG, `/${mediaId}/comments`, token, { fields: "id,text,timestamp,username,parent_id", limit: "50" });
    const semFields = await probe(GRAPH_IG, `/${mediaId}/comments`, token, { limit: "50" });

    return NextResponse.json({
      conta: { display: conn.display_name, igId },
      escopos_pedidos_no_connect: sec.scopes,
      escopos_reais: escopos,
      media: detalhe,
      comentarios_com_fields: full ? comentarios : { status: comentarios.status, quantidade: (comentarios.body as { data?: unknown[] })?.data?.length ?? null, erro: (comentarios.body as { error?: unknown })?.error ?? null },
      comentarios_sem_fields: full ? semFields : { status: semFields.status, quantidade: (semFields.body as { data?: unknown[] })?.data?.length ?? null, erro: (semFields.body as { error?: unknown })?.error ?? null },
    });
  }

  /* ---- lista de mídias: quantas existem mesmo, e quantas têm comentário ---- */
  const midias = await probe(GRAPH_IG, `/${igId}/media`, token, { fields: "id,timestamp,comments_count,permalink", limit: "100" });
  const data = ((midias.body as { data?: Array<{ id: string; timestamp?: string; comments_count?: number }> })?.data) ?? [];

  return NextResponse.json({
    conta: { display: conn.display_name, igId },
    escopos_pedidos_no_connect: sec.scopes,
    escopos_reais: escopos,
    midias: {
      status: midias.status,
      total_retornado: data.length,
      com_comentario: data.filter((m) => (m.comments_count ?? 0) > 0).length,
      paginacao: Boolean((midias.body as { paging?: { next?: string } })?.paging?.next),
      amostra: data.slice(0, 15).map((m) => ({ id: m.id, quando: m.timestamp, comentarios: m.comments_count })),
      erro: (midias.body as { error?: unknown })?.error ?? null,
    },
    dica: "para investigar um post específico: ?media=<id>&full=1",
  });
}
