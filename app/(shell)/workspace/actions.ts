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

export type QuickReply = { id: string; category: string; text: string };

/** Biblioteca de respostas prontas: sorteio diário determinístico + sazonais no período. */
export async function listQuickReplies(): Promise<QuickReply[]> {
  const { sb, active } = await getSession();
  const { data } = await sb.from("quick_replies").select("id, category, text, season_from, season_to").eq("brand_id", active!.id).eq("is_active", true);
  const today = new Date();
  const mmdd = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const inSeason = (f: string | null, t: string | null) => !f || !t ? true : (f <= t ? (mmdd >= f && mmdd <= t) : (mmdd >= f || mmdd <= t));
  // semente = marca + data → ordem muda todo dia, mas é estável durante o dia
  const seedStr = `${active!.id}-${today.toISOString().slice(0, 10)}`;
  let h = 2166136261; for (const ch of seedStr) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
  return (data ?? []).filter((q) => inSeason(q.season_from, q.season_to))
    .map((q) => ({ id: q.id, category: q.category, text: q.text, r: rnd() }))
    .sort((a, b) => a.r - b.r).map(({ id, category, text }) => ({ id, category, text }));
}
