"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ canConfigure }: { canConfigure: boolean }) {
  const path = usePathname();
  const items = [
    { href: "/workspace", label: "Responder" },
    { href: "/aprendizado", label: "Aprendizado" },
    ...(canConfigure ? [{ href: "/config", label: "Configuração da marca" }] : []),
  ];
  return (
    <nav className="nav" aria-label="Seções">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={path.startsWith(i.href) ? "page" : undefined}>{i.label}</Link>
      ))}
    </nav>
  );
}
