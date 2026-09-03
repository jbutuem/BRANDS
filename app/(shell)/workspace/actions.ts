"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/brand";

export type OpenConv = { id: string; channel: string; status: string; label: string | null; summary: string | null; region_uf: string | null; last_activity: string; msgs: number };
export type Msg = { id: string; direction: "in" | "out"; content: string; created_at: string };

export async function listOpen(): Promise<OpenConv[]> {
  const { sb, active } = await getSession();
  const { data } = await sb.from("conversations").select("id, channel, status, label, summary, region_uf, last_activity, messages(count)")
    .eq("brand_id", active!.id).in("status", ["aberta", "respondida", "encaminhada"]).order("last_activity", { ascending: false }).limit(30);
  return (data ?? []).map((c) => ({ ...c, msgs: (c.messages as unknown as { count: number }[])?.[0]?.count ?? 0 })) as OpenConv[];
}

export async function loadThread(conversationId: string): Promise<Msg[]> {
  const { sb } = await getSession();
  const { data } = await sb.from("messages").select("id, direction, content, created_at").eq("conversation_id", conversationId).order("created_at");
  return (data ?? []) as Msg[];
}

export async function closeConversation(conversationId: string) {
  const { sb } = await getSession();
  await sb.from("conversations").update({ status: "encerrada", last_activity: new Date().toISOString() }).eq("id", conversationId);
  revalidatePath("/workspace");
}

export async function setLabel(conversationId: string, label: string) {
  const { sb } = await getSession();
  await sb.from("conversations").update({ label: label.trim().slice(0, 60) || null }).eq("id", conversationId);
}
