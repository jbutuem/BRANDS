import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { BRAND_COOKIE } from "@/lib/brand";
import { supabaseServer } from "@/lib/supabase/server";

// Troca de marca: grava o cookie SÓ se a RLS confirmar que o usuário é membro.
export async function POST(req: Request) {
  const { slug } = await req.json();
  const sb = await supabaseServer();
  const { data } = await sb.from("brands").select("slug").eq("slug", slug).maybeSingle();
  if (!data) return NextResponse.json({ error: "marca não autorizada" }, { status: 403 });
  const store = await cookies();
  store.set(BRAND_COOKIE, slug, { httpOnly: true, sameSite: "lax", path: "/" });
  return NextResponse.json({ ok: true });
}
