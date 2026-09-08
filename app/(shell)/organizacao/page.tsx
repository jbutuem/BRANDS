import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/brand";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { RoleSelect } from "./RoleSelect";

export const dynamic = "force-dynamic";

const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function requireOrgAdmin() {
  const session = await getSession();
  if (!session.isAdminAnywhere) redirect("/workspace");
  return session;
}

async function createBrand(formData: FormData) {
  "use server";
  const { user } = await requireOrgAdmin();
  const admin = supabaseAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const slug = slugify(String(formData.get("slug") ?? "") || name);
  const siteUrl = String(formData.get("site_url") ?? "").trim() || null;
  let orgId = String(formData.get("org_id") ?? "");
  const newOrgName = String(formData.get("new_org_name") ?? "").trim();
  if (orgId === "__new__" && newOrgName) {
    const { data: org, error: orgErr } = await admin.from("organizations").insert({ slug: slugify(newOrgName), name: newOrgName }).select("id").single();
    if (orgErr) return;
    orgId = org.id;
  }
  if (!orgId || orgId === "__new__") return;
  const { data: brand, error } = await admin.from("brands").insert({ slug, name, site_url: siteUrl, org_id: orgId }).select("id").single();
  if (error) return;
  await admin.from("brand_settings").insert({ brand_id: brand.id });
  await admin.from("brand_memberships").insert({ user_id: user.id, brand_id: brand.id, role: "admin" });
  revalidatePath("/organizacao");
  redirect("/organizacao?salvo=marca");
}

async function inviteUser(formData: FormData) {
  "use server";
  await requireOrgAdmin();
  const admin = supabaseAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "operator");
  const brandIds = formData.getAll("brand_ids").map(String).filter(Boolean);
  if (!email || !brandIds.length) return;

  let userId: string | null = null;
  const { data: created, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email);
  if (created?.user) userId = created.user.id;
  if (!userId && inviteErr) {
    // já existe: procura o usuário pelo e-mail
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    userId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
  }
  if (!userId) return;

  for (const brandId of brandIds) {
    await admin.from("brand_memberships").upsert({ user_id: userId, brand_id: brandId, role }, { onConflict: "user_id,brand_id" });
  }
  revalidatePath("/organizacao");
  redirect("/organizacao?salvo=usuario");
}

async function updateRole(formData: FormData) {
  "use server";
  await requireOrgAdmin();
  const admin = supabaseAdmin();
  const userId = String(formData.get("user_id"));
  const brandId = String(formData.get("brand_id"));
  const role = String(formData.get("role"));
  await admin.from("brand_memberships").update({ role }).eq("user_id", userId).eq("brand_id", brandId);
  revalidatePath("/organizacao");
}

async function removeAccess(formData: FormData) {
  "use server";
  await requireOrgAdmin();
  const admin = supabaseAdmin();
  await admin.from("brand_memberships").delete().eq("user_id", String(formData.get("user_id"))).eq("brand_id", String(formData.get("brand_id")));
  revalidatePath("/organizacao");
}

const inp: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 6, padding: 8 };

export default async function Organizacao({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const { salvo } = await searchParams;
  await requireOrgAdmin();
  const admin = supabaseAdmin();

  const [{ data: orgs }, { data: brands }, { data: memberships }, { data: userList }] = await Promise.all([
    admin.from("organizations").select("id, name, slug").order("name"),
    admin.from("brands").select("id, slug, name, site_url, org_id, is_active").order("name"),
    admin.from("brand_memberships").select("user_id, brand_id, role"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emailOf = new Map((userList?.users ?? []).map((u) => [u.id, u.email ?? u.id]));
  const brandOf = new Map((brands ?? []).map((b) => [b.id, b]));
  const byUser = new Map<string, { email: string; rows: { brandId: string; brandName: string; role: string }[] }>();
  for (const m of memberships ?? []) {
    const email = emailOf.get(m.user_id) ?? m.user_id;
    const b = brandOf.get(m.brand_id);
    if (!byUser.has(m.user_id)) byUser.set(m.user_id, { email, rows: [] });
    byUser.get(m.user_id)!.rows.push({ brandId: m.brand_id, brandName: b?.name ?? "?", role: m.role });
  }
  const users = [...byUser.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => a.email.localeCompare(b.email));

  return (
    <div>
      <h2>Organização</h2>
      <p className="lede">Marcas atendidas pela TGT e quem tem acesso a cada uma. Visível só para administradores.</p>

      {salvo && <div className="panel" style={{ borderLeft: "4px solid #1b7f4b", padding: "12px 22px" }}>✓ {salvo === "marca" ? "Marca criada. Você já é administrador dela." : "Acesso concedido. Se o e-mail era novo, um convite foi enviado para a pessoa definir a senha."}</div>}

      <div className="panel">
        <h3>Marcas</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginBottom: 16 }}>
          <thead><tr style={{ textAlign: "left", color: "var(--ink-2)" }}><th style={{ padding: "6px 0" }}>Marca</th><th>Slug</th><th>Site</th><th>Status</th></tr></thead>
          <tbody>
            {(brands ?? []).map((b) => (
              <tr key={b.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td style={{ padding: "6px 0" }}>{b.name}</td>
                <td className="muted">{b.slug}</td>
                <td className="muted">{b.site_url ?? "—"}</td>
                <td className="muted">{b.is_active ? "ativa" : "inativa"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={createBrand} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8, alignItems: "start" }}>
          <input name="name" placeholder="Nome da marca" required style={inp} />
          <input name="slug" placeholder="slug (opcional)" style={inp} />
          <input name="site_url" placeholder="Site (opcional)" style={inp} />
          <select name="org_id" style={inp} defaultValue={orgs?.[0]?.id}>
            {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            <option value="__new__">+ nova organização (novo cliente)</option>
          </select>
          <button className="btn" type="submit">Criar marca</button>
          <input name="new_org_name" placeholder="Nome da nova organização (se selecionou acima)" style={{ ...inp, gridColumn: "1 / -1" }} />
        </form>
      </div>

      <div className="panel">
        <h3>Conceder acesso / convidar</h3>
        <p style={{ marginBottom: 12 }}>Se o e-mail ainda não existe no Listening, recebe um convite por e-mail para criar a própria senha. Se já existe, só ganha acesso à(s) marca(s) marcada(s).</p>
        <form action={inviteUser} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 200px auto", gap: 8 }}>
            <input name="email" type="email" placeholder="e-mail da pessoa" required style={inp} />
            <select name="role" style={inp} defaultValue="operator">
              <option value="operator">Operador</option>
              <option value="admin">Administrador</option>
            </select>
            <button className="btn" type="submit">Conceder acesso</button>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {(brands ?? []).map((b) => (
              <label key={b.id} style={{ fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" name="brand_ids" value={b.id} /> {b.name}
              </label>
            ))}
          </div>
        </form>
      </div>

      <div className="panel">
        <h3>Usuários e acesso</h3>
        {!users.length ? <p className="muted">Nenhum usuário ainda.</p> : users.map((u) => (
          <div key={u.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
            <b>{u.email}</b>
            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
              {u.rows.map((r) => (
                <div key={r.brandId} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
                  <span style={{ minWidth: 140 }}>{r.brandName}</span>
                  <RoleSelect action={updateRole} userId={u.id} brandId={r.brandId} defaultRole={r.role} showBrandManager={r.role === "brand_manager"} />
                  <form action={removeAccess}>
                    <input type="hidden" name="user_id" value={u.id} /><input type="hidden" name="brand_id" value={r.brandId} />
                    <button type="submit" style={{ background: "none", border: "none", color: "#b3261e", textDecoration: "underline", cursor: "pointer", fontSize: 13 }}>remover</button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
