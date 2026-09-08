import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSession } from "@/lib/brand";
import { authorizeUrl, appSecret } from "@/lib/meta";

export const runtime = "nodejs";

/** state assinado: leva a marca ativa e expira em 10 min. Evita CSRF no callback. */
export function signState(brandId: string, userId: string) {
  const payload = `${brandId}.${userId}.${Date.now()}`;
  const sig = crypto.createHmac("sha256", appSecret()).update(payload).digest("hex").slice(0, 32);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export async function GET() {
  const { user, active } = await getSession();
  if (!user || !active) return NextResponse.json({ error: "sem marca ativa" }, { status: 403 });
  try {
    return NextResponse.redirect(authorizeUrl(signState(active.id, user.id)));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
