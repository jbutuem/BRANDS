import { NextResponse } from "next/server";
import { getSession } from "@/lib/brand";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** POST { responseId, kind: gostei|nao_gostei|copiada|regerada|enviada, comment? } */
export async function POST(req: Request) {
  const { responseId, kind, comment } = await req.json();
  const { sb, user, active, role } = await getSession();
  if (!active) return NextResponse.json({ error: "sem marca" }, { status: 403 });

  const { error } = await sb.from("feedback").insert({ response_id: responseId, brand_id: active.id, kind, comment: comment ?? null, user_id: user.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 👍 de gestor/admin promove a resposta a exemplo-ouro da marca (few-shot)
  if (kind === "gostei" && (role === "admin" || role === "brand_manager")) {
    const admin = supabaseAdmin();
    const { data: r } = await admin.from("responses").select("content, message_id, classifier_out").eq("id", responseId).eq("brand_id", active.id).maybeSingle();
    const { data: m } = r ? await admin.from("messages").select("content").eq("id", r.message_id).maybeSingle() : { data: null };
    if (r && m) await admin.from("golden_responses").insert({ brand_id: active.id, question: m.content, answer: r.content, intent: (r.classifier_out as { intent?: string })?.intent ?? null, promoted_by: user.id });
  }
  if (kind === "copiada" || kind === "enviada") {
    const admin = supabaseAdmin();
    const { data: r } = await admin.from("responses").select("message_id").eq("id", responseId).maybeSingle();
    if (r) {
      const { data: m } = await admin.from("messages").select("conversation_id").eq("id", r.message_id).maybeSingle();
      if (m) await sb.from("conversations").update({ status: "respondida", updated_at: new Date().toISOString() }).eq("id", m.conversation_id);
    }
  }
  return NextResponse.json({ ok: true });
}
