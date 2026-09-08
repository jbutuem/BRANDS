"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/brand";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { unsubscribePage } from "@/lib/meta";

/** Remove a conexão: cancela a assinatura no Meta e apaga o token. Atendimentos já criados ficam. */
export async function disconnect(form: FormData) {
  const id = String(form.get("id") ?? "");
  const { sb, active } = await getSession();
  if (!id || !active) return;

  // RLS confirma que a conexão é da marca ativa antes de qualquer chamada com service role.
  const { data: conn } = await sb
    .from("channel_connections")
    .select("id, page_id, provider, external_id")
    .eq("id", id)
    .eq("brand_id", active.id)
    .maybeSingle();
  if (!conn) return;

  const admin = supabaseAdmin();
  const { data: sec } = await admin.from("channel_secrets").select("access_token").eq("connection_id", conn.id).maybeSingle();

  // Só cancela a assinatura da página se nenhuma outra conexão ainda depender dela
  // (a página do Facebook e o IG vinculado compartilham o mesmo page_id).
  if (sec?.access_token && conn.page_id) {
    const { count } = await admin
      .from("channel_connections")
      .select("id", { count: "exact", head: true })
      .eq("page_id", conn.page_id)
      .neq("id", conn.id);
    if (!count) {
      try { await unsubscribePage(conn.page_id, sec.access_token); } catch { /* já pode estar desassinada */ }
    }
  }

  await admin.from("channel_secrets").delete().eq("connection_id", conn.id);
  await admin.from("channel_connections").delete().eq("id", conn.id);
  revalidatePath("/config/canais");
}
