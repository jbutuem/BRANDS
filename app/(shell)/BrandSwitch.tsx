"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Brand } from "@/lib/brand";

export function BrandSwitch({ brands, activeSlug }: { brands: Brand[]; activeSlug: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="brand-switch" role="group" aria-label="Marca ativa">
      {brands.map((b) => (
        <button
          key={b.id}
          aria-current={b.slug === activeSlug}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await fetch("/api/brand", { method: "POST", body: JSON.stringify({ slug: b.slug }) });
              if (r.ok) router.refresh();
            })
          }
        >
          {b.name}
        </button>
      ))}
    </div>
  );
}
