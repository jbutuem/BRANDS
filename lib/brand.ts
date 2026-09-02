import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";

export type Brand = { id: string; slug: string; name: string; site_url: string | null };
export type Membership = { brand_id: string; role: "admin" | "brand_manager" | "operator" };

export const BRAND_COOKIE = "listening_brand";

/**
 * Regra 1 do projeto: o brand_id ativo vem de um cookie e é SEMPRE validado
 * contra as memberships do usuário (auth_brand_ids via RLS). O cliente não
 * decide a marca; se o cookie apontar para uma marca que o usuário não tem,
 * cai na primeira marca disponível.
 */
export async function getSession() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  // bootstrap do primeiro admin (no-op depois da primeira vez)
  const { data: brandsData } = await sb.from("brands").select("id, slug, name, site_url").order("name");
  let brands = (brandsData ?? []) as Brand[];
  if (brands.length === 0) {
    const { data: boot } = await sb.rpc("bootstrap_first_admin");
    if (boot) {
      const again = await sb.from("brands").select("id, slug, name, site_url").order("name");
      brands = (again.data ?? []) as Brand[];
    }
  }

  const { data: mData } = await sb.from("brand_memberships").select("brand_id, role").eq("user_id", user.id);
  const memberships = (mData ?? []) as Membership[];

  const cookieStore = await cookies();
  const wanted = cookieStore.get(BRAND_COOKIE)?.value;
  const active = brands.find((b) => b.slug === wanted) ?? brands[0] ?? null;
  const role = active ? memberships.find((m) => m.brand_id === active.id)?.role ?? null : null;

  return { sb, user, brands, active, role };
}
