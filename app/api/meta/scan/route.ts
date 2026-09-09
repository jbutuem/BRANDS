import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listMedia, listComments, listConversations, conversationMessages, RateLimited } from "@/lib/meta-read";
import { ingestItem, type Conn, type SocialItem } from "@/lib/social-ingest";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Janela do primeiro run de cada conexão: traz o histórico parado nas contas. */
const BACKFILL_DIAS = 30;
/** Nos runs seguintes, sobrepõe a marca d'água para não perder evento na borda. */
const OVERLAP_MIN = 10;

function autorizado(req: Request) {
  const esperado = process.env.SCAN_SECRET;
  if (!esperado) return false; // sem segredo configurado, o endpoint fica fechado
  const h = req.headers.get("x-scan-secret") ?? new URL(req.url).searchParams.get("secret");
  return h === esperado;
}

/**
 * O Instagram Login devolve `username` no comentário, não um id de autor.
 * Guardamos um hash em vez do @: serve para agrupar o mesmo autor no mesmo post,
 * que é o único uso, sem persistir o handle. Responder usa o id do comentário.
 */
function autorOpaco(username: string | undefined): string | null {
  if (!username) return null;
  return "ig_" + crypto.createHash("sha256").update(username.toLowerCase()).digest("hex").slice(0, 24);
}

type Row = Conn & { display_name: string | null; last_scanned_at: string | null; backfill_done_at: string | null };

export async function POST(req: Request) {
  if (!autorizado(req)) return new Response("não autorizado", { status: 401 });

  const admin = supabaseAdmin();
  const url = new URL(req.url);
  const trigger = url.searchParams.get("trigger") ?? "cron";
  const brandFilter = url.searchParams.get("brand");

  let q = admin
    .from("channel_connections")
    .select("id, brand_id, external_id, ig_user_id, page_id, display_name, last_scanned_at, backfill_done_at")
    .eq("provider", "instagram")
    .eq("status", "active");
  if (brandFilter) q = q.eq("brand_id", brandFilter);
  const { data: conns } = await q;

  const resumo: Array<Record<string, unknown>> = [];

  for (const conn of (conns ?? []) as Row[]) {
    const { data: run } = await admin
      .from("scan_runs")
      .insert({ connection_id: conn.id, brand_id: conn.brand_id, trigger })
      .select("id")
      .single();
    const fecha = (patch: Record<string, unknown>) =>
      run?.id ? admin.from("scan_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", run.id) : Promise.resolve();

    const { data: sec } = await admin.from("channel_secrets").select("access_token").eq("connection_id", conn.id).maybeSingle();
    if (!sec?.access_token) {
      await fecha({ outcome: "sem token", detail: "reconecte o canal" });
      resumo.push({ conta: conn.display_name, erro: "sem token" });
      continue;
    }
    const token = sec.access_token;
    const igId = conn.ig_user_id ?? conn.external_id;
    const handleProprio = (conn.display_name ?? "").replace(/^@/, "").toLowerCase();

    const primeiro = !conn.backfill_done_at;
    const desde = primeiro
      ? new Date(Date.now() - BACKFILL_DIAS * 864e5)
      : new Date(new Date(conn.last_scanned_at ?? Date.now()).getTime() - OVERLAP_MIN * 60000);

    let medias = 0, comentarios = 0, dms = 0, criados = 0;
    const problemas: string[] = [];

    try {
      /* ---------------------------------------------------- comentários */
      for (const media of await listMedia(igId, token, primeiro ? 50 : 25)) {
        if (!media.comments_count) continue;
        if (media.timestamp && new Date(media.timestamp) < new Date(Date.now() - 180 * 864e5)) continue;
        medias++;

        const { comments, nota } = await listComments(media.id, token);
        if (nota) problemas.push(`${media.id}: ${nota}`);

        for (const c of comments) {
          comentarios++;
          const quando = c.timestamp ? new Date(c.timestamp) : null;
          if (quando && quando < desde) continue;

          // Comentário da própria marca não vira atendimento.
          const handle = (c.username ?? c.from?.username ?? "").toLowerCase();
          if (handle && handleProprio && handle === handleProprio) continue;
          if (c.from?.id && c.from.id === igId) continue;

          const texto = (c.text ?? "").trim();
          if (!texto) continue;

          const item: SocialItem = {
            provider: "instagram", surface: "comment", accountId: igId,
            externalId: c.id, threadId: media.id,
            authorId: c.from?.id ?? autorOpaco(handle || undefined),
            text: texto, url: media.permalink ?? null,
          };
          if ((await ingestItem(admin, conn, item, { origem: "scan", token })) === "novo") criados++;
        }
      }

      /* ----------------------------------------------------------- DMs */
      for (const conv of await listConversations(token, primeiro ? 50 : 25)) {
        if (conv.updated_time && new Date(conv.updated_time) < desde) continue;

        for (const m of await conversationMessages(conv.id, token)) {
          dms++;
          const quando = m.created_time ? new Date(m.created_time) : null;
          if (quando && quando < desde) continue;

          const autorId = m.from?.id ?? null;
          if (!autorId || autorId === igId) continue; // mensagem nossa
          const texto = (m.message ?? "").trim();
          if (!texto) continue;

          const item: SocialItem = {
            provider: "instagram", surface: "dm", accountId: igId,
            externalId: m.id, threadId: autorId, authorId: autorId, text: texto,
          };
          if ((await ingestItem(admin, conn, item, { origem: "scan", token })) === "novo") criados++;
        }
      }

      await admin.from("channel_connections").update({
        last_scanned_at: new Date().toISOString(),
        ...(primeiro ? { backfill_done_at: new Date().toISOString() } : {}),
      }).eq("id", conn.id);

      await fecha({
        medias, comments_seen: comentarios, dms_seen: dms, created: criados,
        outcome: primeiro ? `backfill: ${criados} novos` : `${criados} novos`,
        detail: problemas.length ? problemas.join(" · ").slice(0, 400) : null,
      });
      resumo.push({ conta: conn.display_name, medias, comentarios, dms, criados, backfill: primeiro, notas: problemas });
    } catch (e) {
      const limite = e instanceof RateLimited;
      const msg = limite ? "rate limit da Graph API — próximo ciclo continua" : (e instanceof Error ? e.message : String(e));
      // Em rate limit NÃO avança a marca d'água: o próximo ciclo repega o intervalo.
      if (!limite) {
        await admin.from("channel_connections").update({ last_scanned_at: new Date().toISOString() }).eq("id", conn.id);
      }
      await fecha({
        medias, comments_seen: comentarios, dms_seen: dms, created: criados,
        outcome: limite ? "rate limit" : "erro", detail: [msg, ...problemas].join(" · ").slice(0, 400),
      });
      resumo.push({ conta: conn.display_name, erro: msg, criados });
    }
  }

  return NextResponse.json({ ok: true, conexoes: resumo.length, resumo });
}

/** GET só para checagem manual — mesma proteção. */
export async function GET(req: Request) {
  return POST(req);
}
