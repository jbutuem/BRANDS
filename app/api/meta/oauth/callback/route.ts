import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exchangeCode, me, readState, subscribe } from "@/lib/meta";

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
  if (!code || !state) return back("resposta do Instagram sem code/state");

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
    // Business Login for Instagram: uma autorização = uma conta. Não há Página nem /me/accounts.
    const { token, userId, expiresIn, permissions } = await exchangeCode(code);

    let conta: { id?: string; user_id?: string; username?: string } = {};
    try {
      conta = await me(token);
    } catch {
      // /me pode falhar por permissão ainda propagando; o user_id do token já basta.
    }

    /**
     * Ordem importa. O webhook manda entry.id = ID da conta profissional (IGID),
     * que é o `user_id` do token e o campo `user_id` do /me — NÃO o `id` do /me,
     * que é app-scoped e não casa com nada que chega no webhook.
     */
    const igId = String(conta.user_id ?? userId ?? conta.id ?? "");
    if (!igId) return back("não consegui identificar a conta do Instagram autorizada");

    let subscribeErr: string | null = null;
    try {
      await subscribe(token);
    } catch (e) {
      subscribeErr = e instanceof Error ? e.message : String(e);
    }

    const display = conta.username ? `@${conta.username}` : igId;

    const { data: conn, error: cerr } = await admin
      .from("channel_connections")
      .upsert(
        {
          brand_id: parsed.brandId,
          provider: "instagram",
          external_id: igId,
          display_name: display,
          // status e mode são CHECK constraints em inglês — ver channel_connections_*_check.
          status: subscribeErr ? "error" : "active",
          mode: "approval", // humano no meio: nada publica sozinho
          page_id: null,    // este fluxo não usa Página do Facebook
          ig_user_id: igId,
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
    if (cerr || !conn) return back(cerr?.message ?? "falha ao gravar a conexão");

    // Token fora de channel_connections, em tabela sem policy de RLS.
    const { error: serr } = await admin.from("channel_secrets").upsert({
      connection_id: conn.id,
      access_token: token,
      token_type: "instagram_user",
      // Token longo dura 60 dias e é renovável — precisa de rotina de refresh antes disso.
      expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      scopes: permissions,
      updated_at: new Date().toISOString(),
    });
    if (serr) return back(`conta identificada mas token não gravado: ${serr.message}`);

    if (subscribeErr) return back(`${display} conectada, mas o webhook não assinou: ${subscribeErr.slice(0, 200)}`);
    return back(`${display} conectada`, true);
  } catch (e) {
    return back((e instanceof Error ? e.message : String(e)).slice(0, 300));
  }
}
