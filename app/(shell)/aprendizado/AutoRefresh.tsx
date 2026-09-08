"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Enquanto houver documento "processando", atualiza a tela sozinha a cada poucos segundos
 * até tudo ficar "pronto" — evita testar uma pergunta antes da indexação terminar. */
export function AutoRefresh({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [pending, router]);
  return null;
}
