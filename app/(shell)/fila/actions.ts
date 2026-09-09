"use server";
import { getSession } from "@/lib/brand";

export type PendingItem = {
  conversationId: string; messageId: string; content: string; channel: string; surface: string; externalUrl: string | null;
  connected: boolean;
  /** 'suspeita_marca' | 'so_reacao' | null — a varredura marca, o operador decide */
  triagem: string | null; triagemMotivo: string | null;
  responseId: string | null; version: number | null; text: string | null; verdict: string | null; reason: string | null;
  classification: Record<string, unknown> | null; createdAt: string;
};

/** Fila persistente: atendimentos ainda abertos (não aprovados nem reprovados), com a última resposta gerada. */
export async function pendingQueue(): Promise<PendingItem[]> {
  const { sb, active } = await getSession();
  const { data, error } = await sb.rpc("fila_pending", { p_brand_id: active!.id });
  if (error || !data) return [];
  return (data as Array<{
    conversation_id: string; message_id: string; content: string; channel: string; surface: string; external_url: string | null;
    connected: boolean; triagem: string | null; triagem_motivo: string | null;
    response_id: string | null; version: number | null; response_text: string | null; verdict: string | null;
    verdict_reason: string | null; classifier_out: Record<string, unknown> | null; created_at: string;
  }>).map((r) => ({
    conversationId: r.conversation_id, messageId: r.message_id, content: r.content, channel: r.channel, surface: r.surface, externalUrl: r.external_url,
    connected: !!r.connected, triagem: r.triagem, triagemMotivo: r.triagem_motivo,
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
    conversation_id: string; message_id: string; content: string; channel: string; surface: string; external_thread_id: string | null; external_url: string | null;
    connected: boolean;
    response_id: string | null; version: number | null; response_text: string | null; verdict: string | null;
    verdict_reason: string | null; classifier_out: Record<string, unknown> | null; updated_at: string;
  }>).map((r) => ({
    conversationId: r.conversation_id, messageId: r.message_id, content: r.content, channel: r.channel, surface: r.surface, externalUrl: r.external_url,
    externalThreadId: r.external_thread_id, connected: !!r.connected, triagem: null, triagemMotivo: null,
    responseId: r.response_id, version: r.version, text: r.response_text, verdict: r.verdict, reason: r.verdict_reason,
    classification: r.classifier_out, createdAt: r.updated_at,
  }));
}

/** Confirma que a resposta foi de fato publicada no Meta — sai da lista de "aguardando publicação". */
export async function confirmPublished(conversationId: string) {
  const { sb } = await getSession();
  await sb.from("conversations").update({ published_at: new Date().toISOString() }).eq("id", conversationId);
}

/**
 * Descarta o atendimento: sai da Fila sem apagar nada.
 * Usado quando o item não é atendimento de verdade — resposta da própria marca,
 * spam, mensagem trocada. O registro fica, e o meta_events impede que a varredura
 * traga o mesmo item de volta no próximo ciclo.
 */
export async function discardConversation(conversationId: string, motivo?: string) {
  const { sb } = await getSession();
  await sb.rpc("descartar_atendimento", { p_conversation_id: conversationId, p_motivo: motivo ?? null });
}
