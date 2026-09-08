import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exchangeCode, listPages, readState, subscribePage } from "@/lib/meta";

export const runtime = "nodejs";
export const maxDuration = 60;

function back(msg: string, ok = false) {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return NextResponse.redirect(`${base}/config/canais?${ok ? "ok" : "erro"}=${encodeURIComponent(msg)}`);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const erro = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (erro) return back(erro);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back("resposta do Meta sem code/state");

  const parsed = readState(state);
  if (!parsed) return back("state inválido ou expirado — refaça a conexão");

  const admin = supabaseAdmin();

  // O usuário ainda precisa ser admin/gestor da marca no momento do callback.
  const { data: member } = await admin
    .from("brand_memberships")
    .select("role")
    .eq("brand_id", parsed.brandId)
    .eq("user_id", parsed.userId)
    .maybeSingle();
  if (!member || !["admin", "brand_manager"].includes(member.role)) return back("sem permissão para conectar canais nesta marca");

  try {
    const { token: userToken, expiresIn } = await exchangeCode(code);
    const pages = await listPages(userToken);
    if (!pages.length) return back("nenhuma página encontrada nessa conta do Facebook");

    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    const conectadas: string[] = [];
    const falhas: string[] = [];

    for (const page of pages) {
      const ig = page.instagram_business_account;

      // Uma conexão por superfície: a página (Facebook) e, quando houver, o IG business vinculado.
      const alvos = [
        { provider: "facebook", externalId: page.id, display: page.name },
        ...(ig ? [{ provider: "instagram", externalId: ig.id, display: ig.username ? `@${ig.username}` : page.name }] : []),
      ];

      let subscribeErr: string | null = null;
      try {
        await subscribePage(page.id, page.access_token);
      } catch (e) {
        subscribeErr = e instanceof Error ? e.message : String(e);
        falhas.push(`${page.name}: ${subscribeErr}`);
      }

      for (const alvo of alvos) {
        const { data: conn, error: cerr } = await admin
          .from("channel_connections")
          .upsert(
            {
              brand_id: parsed.brandId,
              provider: alvo.provider,
              external_id: alvo.externalId,
              display_name: alvo.display,
              status: subscribeErr ? "erro" : "ativa",
              mode: "sugestao", // humano no meio: nada publica sozinho
              page_id: page.id,
              ig_user_id: ig?.id ?? null,
              subscribed_at: subscribeErr ? null : new Date().toISOString(),
              last_error: subscribeErr,
              connected_by: parsed.userId,
              connected_at: new Date().toISOString(),
              token_ref: "channel_secrets",
            },
            { onConflict: "provider,external_id" }
          )
          .select("id")
          .single();
        if (cerr || !conn) {
          falhas.push(`${alvo.display}: ${cerr?.message ?? "falha ao gravar conexão"}`);
          continue;
        }

        // Token de página: fora de channel_connections, em tabela sem policy de RLS.
        const { error: serr } = await admin.from("channel_secrets").upsert({
          connection_id: conn.id,
          access_token: page.access_token,
          token_type: "page",
          expires_at: expiresAt,
          scopes: [],
          updated_at: new Date().toISOString(),
        });
        if (serr) falhas.push(`${alvo.display}: token não gravado (${serr.message})`);
        else conectadas.push(alvo.display);
      }
    }

    if (!conectadas.length) return back(falhas.join(" · ").slice(0, 300) || "nada foi conectado");
    const msg = `${conectadas.join(", ")} conectado(s)` + (falhas.length ? ` — pendências: ${falhas.join(" · ").slice(0, 200)}` : "");
    return back(msg, true);
  } catch (e) {
    return back((e instanceof Error ? e.message : String(e)).slice(0, 300));
  }
}
