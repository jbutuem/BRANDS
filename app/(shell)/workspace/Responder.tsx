"use client";
import { useEffect, useState } from "react";
import { listOpen, loadThread, closeConversation, setLabel, type OpenConv, type Msg } from "./actions";
import { Library } from "./Library";
import { LeadCard } from "./LeadCard";

type Contact = { id: string; kind: string; name: string; email: string | null; whatsapp: string | null; phone: string | null; scope: string | null };
type Result = {
  conversationId: string; messageId: string; responseId: string; version: number; text: string;
  verdict: "aprovada" | "reescrita" | "redirecionar" | "escalar" | "bloqueada" | "moderacao"; reason: string; escalateTo: string | null; contacts: Contact[];
  classification: { intent: string; uf: string | null; city: string | null; sentiment: string; summary: string; flags: string[]; surface: string; audience: string; businessType: string | null; businessName: string | null; leadSignals: string[]; products: string[] };
  commercial?: Contact[];
  sources: { products: string[]; distributors: string[]; documents: string[] };
  scrub: Record<string, number>; cleanText: string; latencyMs: number;
};
const INTENT: Record<string, string> = { produto: "dúvida de produto", onde_comprar: "onde comprar", tecnica: "dúvida técnica", engajamento: "engajamento", reclamacao: "reclamação", risco: "risco", outro: "outro" };
const CH: Record<string, string> = { instagram: "IG", facebook: "FB", whatsapp: "WA", outro: "—" };
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };

export function Responder({ brandName }: { brandName: string }) {
  const [open, setOpen] = useState<OpenConv[]>([]);
  const [conv, setConv] = useState<OpenConv | null>(null);
  const [thread, setThread] = useState<Msg[]>([]);
  const [name, setName] = useState("");            // só na memória da aba
  const [text, setText] = useState("");
  const [channel, setChannel] = useState("instagram");
  const [surface, setSurface] = useState<"dm" | "comment">("dm");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fb, setFb] = useState<string | null>(null);
  const [label, setLabelState] = useState("");

  async function refreshOpen() { setOpen(await listOpen()); }
  useEffect(() => { refreshOpen(); }, []);

  async function pick(c: OpenConv) {
    setConv(c); setChannel(c.channel); setLabelState(c.label ?? ""); setRes(null); setText(""); setFb(null); setName("");
    setThread(await loadThread(c.id));
  }
  function startNew() { setConv(null); setThread([]); setRes(null); setText(""); setFb(null); setName(""); setLabelState(""); }

  async function generate(regen = false) {
    setBusy(true); setErr(null); setFb(null);
    const body = {
      text, channel, surface, contactName: name || undefined,
      conversationId: regen && res ? res.conversationId : conv?.id,
      messageId: regen && res ? res.messageId : undefined,
    };
    const r = await fetch("/api/respond", { method: "POST", body: JSON.stringify(body) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "falha"); return; }
    if (regen && res) feedback(res.responseId, "regerada");
    setRes(j);
    if (!conv) { await refreshOpen(); const c = (await listOpen()).find((x) => x.id === j.conversationId); if (c) { setConv(c); } }
    setThread(await loadThread(j.conversationId));
  }
  async function feedback(responseId: string, kind: string) { await fetch("/api/feedback", { method: "POST", body: JSON.stringify({ responseId, kind }) }); }
  async function copy() {
    if (!res) return;
    await navigator.clipboard.writeText(res.text);
    await feedback(res.responseId, "copiada"); setFb("copiada");
    setThread(await loadThread(res.conversationId)); setText(""); refreshOpen();
  }
  async function close() { if (!conv) return; await closeConversation(conv.id); startNew(); refreshOpen(); }
  async function saveLabel() { if (conv) { await setLabel(conv.id, label); refreshOpen(); } }

  const scrubbed = res ? Object.values(res.scrub).reduce((a, b) => a + b, 0) : 0;
  const badge = res ? ({ aprovada: ["#1b7f4b", "aprovada pelo guardião"], reescrita: ["#8a6d00", "reescrita e aprovada"], redirecionar: ["#0a4d8c", "direcionada para canal oficial"], moderacao: ["#5b3a8c", "resposta de limite — moderação"], escalar: ["#b3261e", "encaminhar — resposta de acolhimento"], bloqueada: ["#b3261e", "bloqueada — resposta de acolhimento"] } as Record<string, string[]>)[res.verdict] : null;
  const FLAG: Record<string, string> = { ofensa: "ofensa", discurso_odio: "discurso de ódio", sexismo: "machismo / sexualização", ameaca: "ameaça", crise: "sinal de crise", juridico: "jurídico", saude: "saúde", menor: "possível menor" };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr 280px", gap: 16, alignItems: "start" }}>
      {/* Atendimentos abertos */}
      <aside className="panel" style={{ margin: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Atendimentos</h3>
          <button onClick={startNew} className="muted" style={{ background: "none", border: "none", textDecoration: "underline", cursor: "pointer" }}>+ novo</button>
        </div>
        {!open.length && <p className="muted">Nenhum em aberto.</p>}
        {open.map((c) => (
          <button key={c.id} onClick={() => pick(c)} style={{ display: "block", width: "100%", textAlign: "left", background: conv?.id === c.id ? "var(--paper)" : "transparent", border: "none", borderTop: "1px solid var(--line)", padding: "8px 4px", cursor: "pointer" }}>
            <div style={{ fontSize: 13 }}><b>{CH[c.channel] ?? c.channel}</b>{c.region_uf ? ` · ${c.region_uf}` : ""} · <span className="muted">{ago(c.last_activity)} · {c.msgs} msg</span></div>
            <div style={{ fontSize: 13 }}>{c.label || c.summary || "(sem resumo)"}</div>
          </button>
        ))}
      </aside>

      <div>
        {/* Fio do atendimento */}
        {conv && (
          <div className="panel">
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <input value={label} onChange={(e) => setLabelState(e.target.value)} onBlur={saveLabel} placeholder="Referência (ex.: hamburgueria em Goiânia) — sem nome de pessoa"
                style={{ flex: 1, minWidth: 240, border: "1px solid var(--line)", borderRadius: 6, padding: 8, fontSize: 13 }} />
              <button onClick={close} className="muted" style={{ background: "none", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>Encerrar atendimento</button>
            </div>
            {thread.map((m) => (
              <div key={m.id} style={{ display: "flex", justifyContent: m.direction === "out" ? "flex-end" : "flex-start", margin: "6px 0" }}>
                <div style={{ maxWidth: "80%", background: m.direction === "out" ? "var(--brand)" : "var(--paper)", color: m.direction === "out" ? "var(--brand-ink)" : "var(--ink)", borderRadius: 10, padding: "8px 12px", fontSize: 14, whiteSpace: "pre-wrap" }}>{m.content}</div>
              </div>
            ))}
          </div>
        )}

        {/* Entrada */}
        <div className="panel">
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <label className="muted">Canal <select value={channel} onChange={(e) => setChannel(e.target.value)} disabled={!!conv} style={{ marginLeft: 6, padding: 6, borderRadius: 6, border: "1px solid var(--line)" }}>
              <option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="whatsapp">WhatsApp</option><option value="outro">Outro</option>
            </select></label>
            <label className="muted">Onde <select value={surface} onChange={(e) => setSurface(e.target.value as "dm" | "comment")} disabled={!!conv} style={{ marginLeft: 6, padding: 6, borderRadius: 6, border: "1px solid var(--line)" }}>
              <option value="dm">Mensagem direta</option><option value="comment">Comentário público</option>
            </select></label>
            <label className="muted">Como a pessoa se chama <input value={name} onChange={(e) => setName(e.target.value)} placeholder="opcional — usado na resposta, não é guardado" style={{ marginLeft: 6, padding: 6, borderRadius: 6, border: "1px solid var(--line)", width: 300 }} /></label>
          </div>
          <textarea className="paste" value={text} onChange={(e) => setText(e.target.value)} placeholder={conv ? "Cole a nova mensagem do cliente neste atendimento…" : `Cole aqui a mensagem recebida por ${brandName}…`} disabled={busy} />
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
            <button className="btn" onClick={() => generate(false)} disabled={busy || !text.trim()}>{busy ? "Pensando…" : "Gerar resposta"}</button>
            {res && <button className="btn" onClick={() => generate(true)} disabled={busy} style={{ background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>Regerar</button>}
            {err && <span className="error">{err}</span>}
          </div>
        </div>

        {/* Resposta */}
        {res && (
          <div className="panel" style={{ borderLeft: `4px solid ${badge![0]}` }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <span style={{ color: badge![0], fontWeight: 600 }}>{badge![1]}</span>
              {res.classification.audience === "b2b" && <span style={{ background: "#1b7f4b", color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>B2B{res.classification.businessType ? ` · ${res.classification.businessType}` : ""}</span>}
              {res.classification.audience === "b2c" && <span style={{ background: "var(--paper)", borderRadius: 999, padding: "2px 10px", fontSize: 12 }}>consumidor</span>}
              <span className="muted">· {INTENT[res.classification.intent] ?? res.classification.intent}{res.classification.uf ? ` · ${res.classification.uf}` : ""} · v{res.version} · {(res.latencyMs / 1000).toFixed(1)}s</span>
              {scrubbed > 0 && <span className="muted">· {scrubbed} dado(s) pessoal(is) fora do banco</span>}
            </div>
            {res.classification.flags?.length > 0 && <p style={{ marginBottom: 10, padding: "8px 12px", background: "#fff4e5", borderRadius: 6, color: "#7a4a00" }}>⚠ Atenção: {res.classification.flags.map((f) => FLAG[f] ?? f).join(", ")}. {res.classification.flags.some((f) => ["crise", "ameaca", "juridico", "menor"].includes(f)) ? "Prioridade humana — avise o responsável antes de responder." : "Responda uma vez, com respeito, sem prolongar."}</p>}
            {res.verdict === "moderacao" && <div style={{ marginBottom: 10, padding: "8px 12px", background: "#f1ecf8", borderRadius: 6, color: "#3d2566", fontSize: 14 }}>
              <b>Como agir:</b> responda UMA vez com o limite abaixo (ou não responda) e modere o canal — {res.classification.surface === "comment" ? "no Instagram/Facebook, oculte o comentário (o autor não é avisado); se for discurso de ódio ou ameaça, denuncie." : "se a pessoa insistir, não responda mais e bloqueie/restrinja o perfil."} Nunca discuta, nunca cite a frase, nunca emende produto.
            </div>}
            {res.verdict === "redirecionar" && <p className="muted" style={{ marginBottom: 10 }}>A informação não está na base, mas existe em canal oficial ({res.reason}). A resposta direciona para lá. Se subir esse material na Aprendizado, a próxima sai direta.</p>}
            {(res.verdict === "escalar" || res.verdict === "bloqueada") && <p className="error" style={{ marginBottom: 10 }}>O guardião não aprovou uma resposta direta ({res.reason}). Abaixo vai só o acolhimento e o encaminhamento — o assunto em si fica com {res.escalateTo ?? "a equipe responsável"}.</p>}
            <div style={{ whiteSpace: "pre-wrap", fontSize: 16, lineHeight: 1.55, padding: "4px 0 14px" }}>{res.text}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn" onClick={copy}>{fb === "copiada" ? "Copiado ✓ (registrado no atendimento)" : "Copiar e registrar"}</button>
              <button onClick={() => { feedback(res.responseId, "gostei"); setFb("gostei"); }} disabled={!!fb && fb !== "copiada"} style={btn(fb === "gostei")}>👍</button>
              <button onClick={() => { feedback(res.responseId, "nao_gostei"); setFb("nao_gostei"); }} disabled={!!fb && fb !== "copiada"} style={btn(fb === "nao_gostei")}>👎</button>
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
                {!res.sources.products.length && !res.sources.distributors.length && !res.sources.documents.length && <div>Nada da base — resposta só com a persona da marca. Registrado como lacuna.</div>}
                <div style={{ marginTop: 6 }}>Mensagem como foi guardada: <i>{res.cleanText}</i></div>
              </div>
            </details>
          </div>
        )}
        {res && res.classification.audience === "b2b" && res.verdict !== "moderacao" && (
          <LeadCard key={res.conversationId} brandName={brandName} conversationId={res.conversationId} channel={channel}
            prefill={{ businessType: res.classification.businessType, businessName: res.classification.businessName, city: res.classification.city, uf: res.classification.uf, products: res.classification.products, leadSignals: res.classification.leadSignals, summary: res.classification.summary }}
            commercial={res.commercial ?? []} />
        )}
      </div>

      <Library name={name} />
    </div>
  );
}
function btn(active: boolean): React.CSSProperties {
  return { background: active ? "var(--ink)" : "transparent", color: active ? "#fff" : "var(--ink)", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 14px", cursor: "pointer" };
}
