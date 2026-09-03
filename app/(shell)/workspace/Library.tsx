"use client";
import { useEffect, useMemo, useState } from "react";
import { listQuickReplies, type QuickReply } from "./actions";

const CATS: [string, string][] = [
  ["reacoes", "Reações"], ["boas_vindas", "Boas-vindas"], ["agradecimento", "Obrigado"], ["engajamento", "Puxar papo"],
  ["direcionamento", "Direcionar"], ["espera", "Espera"], ["encerramento", "Fechar"], ["datas", "Datas"],
];
const PER_CAT = 3;

export function Library({ name }: { name: string }) {
  const [all, setAll] = useState<QuickReply[]>([]);
  const [cat, setCat] = useState("reacoes");
  const [offset, setOffset] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => { listQuickReplies().then(setAll); }, []);

  const items = useMemo(() => {
    const list = all.filter((q) => q.category === cat);
    const o = (offset[cat] ?? 0) % Math.max(list.length, 1);
    return list.length <= PER_CAT ? list : [...list.slice(o), ...list.slice(0, o)].slice(0, PER_CAT);
  }, [all, cat, offset]);
  const total = all.filter((q) => q.category === cat).length;
  const fill = (t: string) => t.replace(/\{nome\}/g, name.trim().split(/\s+/)[0] || "").replace(/,\s+!/g, "!").replace(/\s{2,}/g, " ");

  async function copy(q: QuickReply) {
    await navigator.clipboard.writeText(fill(q.text));
    setCopied(q.id); setTimeout(() => setCopied(null), 1500);
  }

  return (
    <aside className="panel" style={{ margin: 0 }}>
      <h3 style={{ marginBottom: 10 }}>Respostas prontas</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
        {CATS.map(([k, l]) => (
          <button key={k} onClick={() => setCat(k)} style={{ fontSize: 12, padding: "4px 8px", borderRadius: 999, border: "1px solid var(--line)", background: cat === k ? "var(--ink)" : "transparent", color: cat === k ? "#fff" : "var(--ink)", cursor: "pointer" }}>{l}</button>
        ))}
      </div>
      {!items.length && <p className="muted">{cat === "datas" ? "Nenhuma data comemorativa neste período." : "Nada nesta categoria."}</p>}
      {items.map((q) => (
        <div key={q.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", borderTop: "1px solid var(--line)", padding: "8px 0" }}>
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>{fill(q.text)}</div>
          <button onClick={() => copy(q)} title="Copiar" aria-label="Copiar" style={{ background: "none", border: "1px solid var(--line)", borderRadius: 6, padding: "4px 7px", cursor: "pointer", fontSize: 13 }}>{copied === q.id ? "✓" : "⧉"}</button>
        </div>
      ))}
      {total > PER_CAT && (
        <button onClick={() => setOffset({ ...offset, [cat]: (offset[cat] ?? 0) + PER_CAT })} className="muted" style={{ background: "none", border: "none", textDecoration: "underline", cursor: "pointer", padding: "8px 0 0" }}>
          outras variações ({total} nesta categoria)
        </button>
      )}
      <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>A seleção muda todo dia. {name ? `“{nome}” vira ${name.trim().split(/\s+/)[0]}.` : "Preencha o nome ao lado para personalizar."}</p>
    </aside>
  );
}
