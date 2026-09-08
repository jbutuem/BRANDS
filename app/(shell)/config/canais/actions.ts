"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/brand";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { unsubscribe } from "@/lib/meta";

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
