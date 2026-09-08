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
