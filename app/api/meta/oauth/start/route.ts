import { NextResponse } from "next/server";
import { getSession } from "@/lib/brand";
import { authorizeUrl, signState } from "@/lib/meta";

export const runtime = "nodejs";

/** Manda o gestor para o diálogo do Facebook Login for Business, com state assinado. */
export async function GET() {
  const { user, active, role } = await getSession();
  if (!user || !active) return NextResponse.json({ error: "sem marca ativa" }, { status: 403 });
  if (role !== "admin" && role !== "brand_manager") {
    return NextResponse.json({ error: "só admin ou gestor da marca pode conectar canais" }, { status: 403 });
  }
  try {
    return NextResponse.redirect(authorizeUrl(signState(active.id, user.id)));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
