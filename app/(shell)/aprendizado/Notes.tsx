"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { addNote, removeNote } from "./actions";

type Note = { id: string; kind: string; title: string | null; body: string; created_at: string };
const KINDS: [string, string, string][] = [
  ["fato", "Fato da marca", "verdade que vale para toda a linha — o Redator afirma com segurança (ex.: 'vendemos também em marketplaces')"],
  ["padrao", "Padrão de resposta", "como a marca deve se comportar em certa situação (ex.: 'quando perguntarem de rendimento, sempre citar o pouch')"],
  ["dica", "Dica / receita / argumento", "conteúdo que o Redator pode usar quando o assunto aparecer"],
  ["correcao", "Correção", "algo que saiu errado e não pode repetir (ex.: 'nunca dizer que não vendemos ao consumidor')"],
];

export function Notes({ notes, canEdit }: { notes: Note[]; canEdit: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState("fato");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const inp: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 6, padding: 8, width: "100%" };
  async function save() {
    if (!body.trim()) return;
    setBusy(true); await addNote(kind, title, body); setTitle(""); setBody(""); setBusy(false); router.refresh();
  }
  return (
    <div className="panel">
      <h3>Anotações de aprendizado</h3>
      <p style={{ marginBottom: 12 }}>Texto livre que entra nas respostas na hora: fatos viram verdades da marca, padrões viram regras de voz, dicas e correções entram no contexto quando o assunto aparece. Sem upload, sem esperar.</p>
      {canEdit && (
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 8 }}>
            <select value={kind} onChange={(e) => setKind(e.target.value)} style={inp}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título curto (opcional)" style={inp} />
          </div>
          <p className="muted" style={{ margin: 0 }}>{KINDS.find(([k]) => k === kind)?.[2]}</p>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escreva a anotação…" style={{ ...inp, minHeight: 80 }} />
          <div><button className="btn" onClick={save} disabled={busy || !body.trim()}>{busy ? "Salvando…" : "Adicionar anotação"}</button></div>
        </div>
      )}
      {!notes.length ? <p className="muted">Nenhuma anotação ainda.</p> : KINDS.map(([k, l]) => {
        const list = notes.filter((n) => n.kind === k);
        return list.length ? (
          <details key={k} open style={{ marginBottom: 8 }}>
            <summary><b>{l}</b> <span className="muted">({list.length})</span></summary>
            {list.map((n) => (
              <div key={n.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0 6px 12px", borderTop: "1px solid var(--line)", fontSize: 14 }}>
                <div style={{ flex: 1 }}>{n.title && <b>{n.title}: </b>}{n.body}<div className="muted">{new Date(n.created_at).toLocaleDateString("pt-BR")}</div></div>
                {canEdit && <button onClick={async () => { await removeNote(n.id); router.refresh(); }} style={{ background: "none", border: "none", color: "#b3261e", textDecoration: "underline", cursor: "pointer", fontSize: 13 }}>remover</button>}
              </div>
            ))}
          </details>
        ) : null;
      })}
    </div>
  );
}
