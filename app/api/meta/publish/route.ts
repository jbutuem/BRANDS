import { NextResponse } from "next/server";
import { getSession } from "@/lib/brand";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { publish, type PublishTarget } from "@/lib/meta";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST { conversationId, responseId, text? }
 * Publica no Instagram a resposta que o operador liberou. O disparo é SEMPRE humano.
 * O texto enviado é o que está na tela (o operador pode ter editado).
 */
export async function POST(req: Request) {
  const { conversationId, responseId, text } = await req.json();
  const { sb, active } = await getSession();
  if (!active) return NextResponse.json({ error: "sem marca ativa" }, { status: 403 });

  // Leitura sob RLS: garante que o operador só publica em atendimento da própria marca.
  const { data: conv } = await sb
    .from("conversations")
    .select("id, brand_id, channel, surface, external_thread_id, external_author_id, channel_connection_id, published_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return NextResponse.json({ error: "atendimento não encontrado" }, { status: 404 });
  if (conv.published_at) return NextResponse.json({ error: "esta resposta já foi publicada" }, { status: 409 });
  if (!conv.channel_connection_id) {
    return NextResponse.json({ error: "atendimento sem canal conectado — este veio de varredura manual, publique pelo app do Instagram" }, { status: 400 });
  }

  const { data: resp } = await sb.from("responses").select("id, content, verdict").eq("id", responseId).maybeSingle();
  if (!resp) return NextResponse.json({ error: "resposta não encontrada" }, { status: 404 });
  if (resp.verdict === "bloqueada") return NextResponse.json({ error: "resposta reprovada pelo Guardião — não pode ser publicada" }, { status: 403 });

  const mensagem = String(text ?? resp.content ?? "").trim();
  if (!mensagem) return NextResponse.json({ error: "mensagem vazia" }, { status: 400 });

  const admin = supabaseAdmin();

  // Alvo: comentário responde no próprio comentário; DM responde ao remetente.
  const { data: inbound } = await admin
    .from("messages")
    .select("id, external_id")
    .eq("conversation_id", conv.id)
    .eq("direction", "in")
    .not("external_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: conn } = await admin
    .from("channel_connections")
    .select("id, page_id, ig_user_id, provider")
    .eq("id", conv.channel_connection_id)
    .maybeSingle();
  const { data: sec } = await admin.from("channel_secrets").select("access_token").eq("connection_id", conv.channel_connection_id).maybeSingle();
  if (!conn || !sec?.access_token) return NextResponse.json({ error: "canal sem token válido — reconecte em Config › Canais" }, { status: 400 });

  const isIg = conv.channel === "instagram";
  let target: PublishTarget;
  if (conv.surface === "comment") {
    if (!inbound?.external_id) return NextResponse.json({ error: "comentário original não identificado" }, { status: 400 });
    target = isIg
      ? { channel: "instagram", surface: "comment", commentId: inbound.external_id }
      : { channel: "facebook", surface: "comment", commentId: inbound.external_id };
  } else if (isIg) {
    // Business Login for Instagram: o nó é /me, o token já identifica a conta.
    if (!conv.external_author_id) return NextResponse.json({ error: "DM sem destinatário identificado" }, { status: 400 });
    target = { channel: "instagram", surface: "dm", recipientId: conv.external_author_id };
  } else {
    if (!conn.page_id || !conv.external_author_id) return NextResponse.json({ error: "DM sem destinatário identificado" }, { status: 400 });
    target = { channel: "facebook", surface: "dm", pageId: conn.page_id, recipientId: conv.external_author_id };
  }

  try {
    const externalId = await publish(target, mensagem, sec.access_token);

    await admin.from("responses").update({
      sent_at: new Date().toISOString(), external_message_id: externalId, send_error: null,
    }).eq("id", resp.id);

    await admin.from("messages").insert({
      conversation_id: conv.id, brand_id: conv.brand_id, direction: "out",
      content: mensagem, external_id: externalId, response_id: resp.id,
    });

    await admin.from("conversations").update({
      status: "respondida", published_at: new Date().toISOString(), last_activity: new Date().toISOString(),
    }).eq("id", conv.id);

    return NextResponse.json({ ok: true, externalId });
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 400);
    await admin.from("responses").update({ send_error: msg }).eq("id", resp.id);
    // Janela de resposta (24h em DM): erro comum e não recuperável por retry.
    const janela = /outside.*allowed window|24 ?h|code 10\b/i.test(msg);
    return NextResponse.json({
      error: janela ? `O Instagram recusou o envio: a janela de resposta desta conversa expirou. ${msg}` : msg,
    }, { status: 502 });
  }
}
