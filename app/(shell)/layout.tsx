import { redirect } from "next/navigation";
import { getSession } from "@/lib/brand";
import { supabaseServer } from "@/lib/supabase/server";
import { BrandSwitch } from "./BrandSwitch";
import { NavLinks } from "./NavLinks";

// Cor de cada ambiente — a barra lateral inteira muda de cor para o operador
// nunca ter dúvida de em qual marca está.
const BRAND_COLOR: Record<string, { bg: string; ink: string }> = {
  junior: { bg: "#e30613", ink: "#ffffff" },
  dvg:    { bg: "#7a1e3a", ink: "#ffffff" },
  siber:  { bg: "#0a4d8c", ink: "#ffffff" },
};

async function signOut() {
  "use server";
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const { user, brands, active, role } = await getSession();
  const color = active ? BRAND_COLOR[active.slug] ?? { bg: "#1b1f24", ink: "#fff" } : { bg: "#1b1f24", ink: "#fff" };

  return (
    <div className="shell" style={{ ["--brand" as string]: color.bg, ["--brand-ink" as string]: color.ink }}>
      <aside className="rail">
        <h1>Listening</h1>
        {active ? (
          <div>
            <p className="brand-name">{active.name}</p>
            <span style={{ fontSize: 13, opacity: .8 }}>{roleLabel(role)}</span>
          </div>
        ) : (
          <p className="brand-name">Sem marca</p>
        )}
        {brands.length > 1 && <BrandSwitch brands={brands} activeSlug={active?.slug ?? null} />}
        <NavLinks canConfigure={role === "admin" || role === "brand_manager"} />
        <footer>
          {user.email}
          <br />
          <form action={signOut}><button type="submit">Sair</button></form>
        </footer>
      </aside>
      <main>
        {active ? children : (
          <>
            <h2>Você ainda não tem acesso a nenhuma marca</h2>
            <p className="lede">Peça a um administrador para incluir seu usuário em uma marca. Nada é exibido até isso acontecer.</p>
          </>
        )}
      </main>
    </div>
  );
}

function roleLabel(role: string | null) {
  return role === "admin" ? "administrador" : role === "brand_manager" ? "gestor da marca" : role === "operator" ? "operador" : "";
}
