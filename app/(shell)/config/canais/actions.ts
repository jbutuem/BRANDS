"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/brand";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { unsubscribe, GRAPH_IG } from "@/lib/meta";

/** Remove a conexão: cancela a assinatura de webhook e apaga o token. Atendimentos já criados ficam. */
export async function disconnect(form: FormData) {
  const id = String(form.get("id") ?? "");
  const { sb, active } = await getSession();
  if (!id || !active) return;

  // RLS confirma que a conexão é da marca ativa antes de qualquer chamada com service role.
  const { data: conn } = await sb
    .from("channel_connections")
    .select("id, provider, external_id")
    .eq("id", id)
    .eq("brand_id", active.id)
    .maybeSingle();
  if (!conn) return;

  const admin = supabaseAdmin();
  const { data: sec } = await admin.from("channel_secrets").select("access_token").eq("connection_id", conn.id).maybeSingle();

  // Business Login for Instagram: a assinatura é por conta, então cancela direto.
  if (sec?.access_token && conn.provider === "instagram") {
    try { await unsubscribe(sec.access_token); } catch { /* já pode estar desassinada ou o token expirou */ }
  }

  await admin.from("channel_secrets").delete().eq("connection_id", conn.id);
  await admin.from("channel_connections").delete().eq("id", conn.id);
  revalidatePath("/config/canais");
}

/**
 * Pergunta ao Instagram o estado REAL da assinatura desta conta.
 * Marcar subscribed_at no connect só prova que a chamada não deu erro —
 * isto prova que o app está de fato assinado e em quais campos.
 * O token nunca sai do servidor.
 */
export async function checkSubscription(form: FormData) {
  const id = String(form.get("id") ?? "");
  const { sb, active } = await getSession();
  if (!id || !active) return;

  const { data: conn } = await sb
    .from("channel_connections")
    .select("id, provider")
    .eq("id", id)
    .eq("brand_id", active.id)
    .maybeSingle();
  if (!conn) return;

  const admin = supabaseAdmin();
  const { data: sec } = await admin.from("channel_secrets").select("access_token").eq("connection_id", conn.id).maybeSingle();
  if (!sec?.access_token) redirect("/config/canais?erro=" + encodeURIComponent("sem token gravado — reconecte"));

  let msg: string;
  try {
    const u = new URL(`${GRAPH_IG}/me/subscribed_apps`);
    u.searchParams.set("access_token", sec.access_token);
    const res = await fetch(u.toString(), { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as {
      data?: Array<{ subscribed_fields?: string[]; name?: string }>;
      error?: { message?: string; code?: number };
    };

    if (!res.ok) {
      msg = `Instagram recusou a consulta: ${json.error?.message ?? res.status}`;
    } else if (!json.data?.length) {
      msg = "O app NÃO está assinado nesta conta — nenhum webhook vai chegar. Reconecte para assinar.";
    } else {
      const campos = json.data.flatMap((d) => d.subscribed_fields ?? []);
      msg = campos.length
        ? `App assinado. Campos ativos: ${campos.join(", ")}`
        : "App assinado, mas sem nenhum campo ativo — nada vai disparar.";
      await admin.from("channel_connections")
        .update({ subscribed_at: new Date().toISOString(), last_error: null })
        .eq("id", conn.id);
    }
  } catch (e) {
    msg = `falha ao consultar: ${e instanceof Error ? e.message : String(e)}`;
  }

  revalidatePath("/config/canais");
  redirect(`/config/canais?ok=${encodeURIComponent(msg)}`);
}
