"use client";
import { useState } from "react";
import { searchKnowledge, type SearchResult } from "./actions";

export function SearchTest({ brandName }: { brandName: string }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() { setBusy(true); setRes(await searchKnowledge(q)); setBusy(false); }
  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="Ex.: onde compro em Goiás? · caramelo salgado · validade do ketchup"
          style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 6, padding: 10 }} />
        <button className="btn" onClick={go} disabled={busy || !q.trim()}>Buscar</button>
      </div>
      {res && (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <p className="muted" style={{ margin: 0 }}>Resultados de <b>{brandName}</b> para “{q}”</p>
          {res.products.length > 0 && <div><b>Produtos</b>{res.products.map((p) => <div key={p.id} className="muted">• {p.name} — cód. {p.codigo ?? "—"} · {p.packaging} · {p.shelf_life ?? "validade não informada"}{p.status !== "ativo" ? ` · ${p.status}` : ""}</div>)}</div>}
          {res.distributors.length > 0 && <div><b>Distribuidores</b>{res.distributors.map((d) => <div key={d.id} className="muted">• {d.fantasia} ({d.cidade ?? "—"}) · {d.ufs.join("/")} · {d.whatsapp ?? d.telefone ?? ""} · {d.email ?? ""}</div>)}</div>}
          {res.chunks.length > 0 && <div><b>Trechos de documentos</b>{res.chunks.map((c) => <div key={c.chunk_id} className="muted" style={{ marginTop: 6 }}>• <i>{c.document_name}{c.page ? `, p. ${c.page}` : ""}</i>: {c.content.slice(0, 220)}…</div>)}</div>}
          {!res.products.length && !res.distributors.length && !res.chunks.length && <p className="muted">Nada encontrado — isso viraria uma lacuna de base.</p>}
        </div>
      )}
    </div>
  );
}
