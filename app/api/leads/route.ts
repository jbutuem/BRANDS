import { NextResponse } from "next/server";
import { getSession } from "@/lib/brand";

/** POST — cria oportunidade. Sem dados pessoais: só perfil do negócio (tipo, cidade, interesse). */
export async function POST(req: Request) {
  const b = await req.json();
  const { sb, user, active } = await getSession();
  if (!active) return NextResponse.json({ error: "sem marca" }, { status: 403 });
  const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const { data, error } = await sb.from("leads").insert({
    brand_id: active.id, conversation_id: b.conversationId ?? null,
    business_name: clean(b.businessName), business_type: clean(b.businessType), city: clean(b.city), uf: clean(b.uf)?.toUpperCase() ?? null,
    interest: Array.isArray(b.interest) ? b.interest.filter(Boolean) : [], est_volume: clean(b.estVolume),
    commercial_sent: !!b.commercialSent, notes: clean(b.notes), channel: clean(b.channel), created_by: user.id,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (b.conversationId) await sb.from("conversations").update({ audience: "b2b", business_type: clean(b.businessType) }).eq("id", b.conversationId);
  return NextResponse.json({ ok: true, id: data.id });
}

/** PATCH — muda status / notas. */
export async function PATCH(req: Request) {
  const b = await req.json();
  const { sb, active } = await getSession();
  if (!active) return NextResponse.json({ error: "sem marca" }, { status: 403 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.status) patch.status = b.status;
  if (typeof b.notes === "string") patch.notes = b.notes;
  if (b.assignedTo !== undefined) patch.assigned_to = b.assignedTo || null;
  const { error } = await sb.from("leads").update(patch).eq("id", b.id).eq("brand_id", active.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
