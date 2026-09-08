"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ canConfigure, canManageOrg }: { canConfigure: boolean; canManageOrg?: boolean }) {
  const path = usePathname();
  const items = [
    { href: "/workspace", label: "Responder" },
    { href: "/fila", label: "Fila" },
    { href: "/aprendizado", label: "Aprendizado" },
    { href: "/leads", label: "Leads" },
    ...(canConfigure ? [{ href: "/config", label: "Configuração da marca" }, { href: "/config/canais", label: "Canais" }] : []),
    ...(canManageOrg ? [{ href: "/organizacao", label: "Organização" }] : []),
  ];
  return (
    <nav className="nav" aria-label="Seções">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={path === i.href || (i.href !== "/config" && path.startsWith(i.href)) ? "page" : undefined}>{i.label}</Link>
      ))}
    </nav>
  );
}
