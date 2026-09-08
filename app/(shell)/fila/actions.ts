"use server";
import { getSession } from "@/lib/brand";

export type PendingItem = {
  conversationId: string; messageId: string; content: string; channel: string; surface: string;
  responseId: string | null; version: number | null; text: string | null; verdict: string | null; reason: string | null;
  classification: Record<string, unknown> | null; createdAt: string;
};

/** Fila persistente: atendimentos ainda abertos (não aprovados nem reprovados), com a última resposta gerada. */
export async function pendingQueue(): Promise<PendingItem[]> {
  const { sb, active } = await getSession();
  const { data, error } = await sb.rpc("fila_pending", { p_brand_id: active!.id });
  if (error || !data) return [];
  return (data as Array<{
    conversation_id: string; message_id: string; content: string; channel: string; surface: string;
    response_id: string | null; version: number | null; response_text: string | null; verdict: string | null;
    verdict_reason: string | null; classifier_out: Record<string, unknown> | null; created_at: string;
  }>).map((r) => ({
    conversationId: r.conversation_id, messageId: r.message_id, content: r.content, channel: r.channel, surface: r.surface,
    responseId: r.response_id, version: r.version, text: r.response_text, verdict: r.verdict, reason: r.verdict_reason,
    classification: r.classifier_out, createdAt: r.created_at,
  }));
}

export type AwaitingItem = PendingItem & { externalThreadId: string | null };

/** Aprovadas pelo operador ("Liberar publicação") mas ainda sem confirmação de que saíram de fato no Meta. */
export async function awaitingPublication(): Promise<AwaitingItem[]> {
  const { sb, active } = await getSession();
  const { data, error } = await sb.rpc("fila_awaiting_publish", { p_brand_id: active!.id });
  if (error || !data) return [];
  return (data as Array<{
    conversation_id: string; message_id: string; content: string; channel: string; surface: string; external_thread_id: string | null;
    response_id: string | null; version: number | null; response_text: string | null; verdict: string | null;
    verdict_reason: string | null; classifier_out: Record<string, unknown> | null; updated_at: string;
  }>).map((r) => ({
    conversationId: r.conversation_id, messageId: r.message_id, content: r.content, channel: r.channel, surface: r.surface,
    externalThreadId: r.external_thread_id,
    responseId: r.response_id, version: r.version, text: r.response_text, verdict: r.verdict, reason: r.verdict_reason,
    classification: r.classifier_out, createdAt: r.updated_at,
  }));
}

/** Confirma que a resposta foi de fato publicada no Meta — sai da lista de "aguardando publicação". */
export async function confirmPublished(conversationId: string) {
  const { sb } = await getSession();
  await sb.from("conversations").update({ published_at: new Date().toISOString() }).eq("id", conversationId);
}
