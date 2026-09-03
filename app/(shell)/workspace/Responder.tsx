"use client";
import { useState } from "react";

type Contact = { id: string; kind: string; name: string; email: string | null; whatsapp: string | null; phone: string | null; scope: string | null };
type Result = {
  conversationId: string; messageId: string; responseId: string; version: number; text: string;
  verdict: "aprovada" | "reescrita" | "escalar" | "bloqueada"; reason: string; escalateTo: string | null; contacts: Contact[];
  classification: { intent: string; uf: string | null; sentiment: string; summary: string };
  sources: { products: string[]; distributors: string[]; documents: string[] };
  scrub: Record<string, number>; cleanText: string; latencyMs: number;
};

const INTENT: Record<string, string> = { produto: "dúvida de produto", onde_comprar: "onde comprar", tecnica: "dúvida técnica", engajamento: "engajamento", reclamacao: "reclamação", risco: "risco", outro: "outro" };

export function Responder({ brandName }: { brandName: string }) {
  const [text, setText] = useState("");
  const [channel, setChannel] = useState("instagram");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fb, setFb] = useState<string | null>(null);

  async function generate(regen = false) {
    setBusy(true); setErr(null); setFb(null);
    const body = regen && res ? { text, channel, conversationId: res.conversationId, messageId: res.messageId } : { text, channel };
    const r = await fetch("/api/respond", { method: "POST", body: JSON.stringify(body) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "falha"); return; }
    if (regen && res) feedback(res.responseId, "regerada");
    setRes(j);
  }
  async function feedback(responseId: string, kind: string) {
    await fetch("/api/feedback", { method: "POST", body: JSON.stringify({ responseId, kind }) });
  }
  async function copy() {
    if (!res) return;
    await navigator.clipboard.writeText(res.text);
    feedback(res.responseId, "copiada"); setFb("copiada");
  }
  function reset() { setText(""); setRes(null); setErr(null); setFb(null); }

  const scrubbed = res ? Object.values(res.scrub).reduce((a, b) => a + b, 0) : 0;
  const badge = res ? ({ aprovada: ["#1b7f4b", "aprovada pelo guardião"], reescrita: ["#8a6d00", "reescrita e aprovada"], escalar: ["#b3261e", "encaminhar"], bloqueada: ["#b3261e", "bloqueada"] } as Record<string, string[]>)[res.verdict] : null;

  return (
    <>
      <div className="panel">
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
          <label className="muted">Canal <select value={channel} onChange={(e) => setChannel(e.target.value)} style={{ marginLeft: 6, padding: 6, borderRadius: 6, border: "1px solid var(--line)" }}>
            <option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="whatsapp">WhatsApp</option><option value="outro">Outro</option>
          </select></label>
          {res && <button onClick={reset} style={{ marginLeft: "auto", background: "none", border: "none", textDecoration: "underline", cursor: "pointer" }} className="muted">nova conversa</button>}
        </div>
        <textarea className="paste" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Cole aqui a mensagem recebida por ${brandName}…`} disabled={busy} />
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
          <button className="btn" onClick={() => generate(false)} disabled={busy || !text.trim()}>{busy ? "Pensando…" : res ? "Nova mensagem" : "Gerar resposta"}</button>
          {res && <button className="btn" onClick={() => generate(true)} disabled={busy} style={{ background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>Regerar</button>}
          {err && <span className="error">{err}</span>}
        </div>
      </div>

      {res && (
        <div className="panel" style={{ borderLeft: `4px solid ${badge![0]}` }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ color: badge![0], fontWeight: 600 }}>{badge![1]}</span>
            <span className="muted">· {INTENT[res.classification.intent] ?? res.classification.intent}{res.classification.uf ? ` · ${res.classification.uf}` : ""} · v{res.version} · {(res.latencyMs / 1000).toFixed(1)}s</span>
            {scrubbed > 0 && <span className="muted">· {scrubbed} dado(s) pessoal(is) removido(s) antes de guardar</span>}
          </div>
          {res.verdict !== "aprovada" && res.verdict !== "reescrita" && <p className="error" style={{ marginBottom: 10 }}>{res.reason}</p>}
          <div style={{ whiteSpace: "pre-wrap", fontSize: 16, lineHeight: 1.55, padding: "4px 0 14px" }}>{res.text}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn" onClick={copy} disabled={res.verdict === "bloqueada"}>{fb === "copiada" ? "Copiado ✓" : "Copiar"}</button>
            <button onClick={() => { feedback(res.responseId, "gostei"); setFb("gostei"); }} disabled={!!fb && fb !== "copiada"} style={btn(fb === "gostei")}>👍 Gostei</button>
            <button onClick={() => { feedback(res.responseId, "nao_gostei"); setFb("nao_gostei"); }} disabled={!!fb && fb !== "copiada"} style={btn(fb === "nao_gostei")}>👎 Não gostei</button>
          </div>
          {res.escalateTo && (
            <div style={{ marginTop: 14 }}>
              <b>Encaminhar para {res.escalateTo}</b>
              {res.contacts.length ? res.contacts.map((c) => (
                <div key={c.id} className="muted">• {c.name}{c.scope ? ` (${c.scope})` : ""} — {c.whatsapp && <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Contato via ${channel} (${brandName}):\n\n${res.cleanText}`)}`} target="_blank">WhatsApp</a>}{c.whatsapp && c.email && " · "}{c.email && <a href={`mailto:${c.email}?subject=${encodeURIComponent(`[Listening] ${brandName} — ${INTENT[res.classification.intent]}`)}&body=${encodeURIComponent(res.cleanText)}`}>e-mail</a>}</div>
              )) : <p className="muted">Nenhum contato de {res.escalateTo} cadastrado para {brandName}. Cadastre em Configuração da marca.</p>}
            </div>
          )}
          <details style={{ marginTop: 14 }} className="muted">
            <summary>O que a resposta usou</summary>
            <div style={{ marginTop: 6 }}>
              {res.sources.products.length > 0 && <div>Produtos: {res.sources.products.join(", ")}</div>}
              {res.sources.distributors.length > 0 && <div>Distribuidores: {res.sources.distributors.join(", ")}</div>}
              {res.sources.documents.length > 0 && <div>Materiais: {res.sources.documents.join(", ")}</div>}
              {!res.sources.products.length && !res.sources.distributors.length && !res.sources.documents.length && <div>Nada da base — resposta só com a persona da marca. Isso foi registrado como lacuna.</div>}
              <div style={{ marginTop: 6 }}>Mensagem como foi guardada: <i>{res.cleanText}</i></div>
            </div>
          </details>
        </div>
      )}
    </>
  );
}
function btn(active: boolean): React.CSSProperties {
  return { background: active ? "var(--ink)" : "transparent", color: active ? "#fff" : "var(--ink)", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 14px", cursor: "pointer" };
}
