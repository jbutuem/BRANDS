"use client";
import { useEffect, useState } from "react";
import { pendingQueue, awaitingPublication, confirmPublished, type PendingItem, type AwaitingItem } from "./actions";

type Contact = { id: string; kind: string; name: string; email: string | null; whatsapp: string | null };
type ApiResult = {
  conversationId: string; messageId: string; responseId: string; version: number; text: string;
  verdict: "aprovada" | "reescrita" | "redirecionar" | "escalar" | "bloqueada" | "moderacao" | "reacao"; reason: string; escalateTo: string | null; contacts: Contact[];
  classification: { intent: string; uf: string | null; sentiment: string; summary: string; flags: string[]; surface: string; audience: string; businessType: string | null };
  sources: { products: string[]; distributors: string[]; documents: string[] };
  scrub: Record<string, number>; cleanText: string; latencyMs: number;
};
type Item = {
  id: string; raw: string; status: "carregando" | "pronta" | "erro" | "aprovada" | "reprovada";
  res?: ApiResult; error?: string; externalThreadId?: string; externalUrl?: string;
  /** veio de canal conectado: publica pela API em vez de copiar */
  connected?: boolean;
  /** atendimento já existente (webhook ou fila persistida) — nunca criar outro */
  conversationId?: string;
};

const INTENT: Record<string, string> = { produto: "produto", onde_comprar: "onde comprar", tecnica: "técnica", engajamento: "engajamento", reclamacao: "reclamação", risco: "risco", outro: "outro" };
const BADGE: Record<string, [string, string]> = {
  aprovada: ["#1b7f4b", "aprovada"], reescrita: ["#8a6d00", "reescrita"], redirecionar: ["#0a4d8c", "direcionada"],
  moderacao: ["#5b3a8c", "moderação"], escalar: ["#b3261e", "encaminhar"], bloqueada: ["#b3261e", "bloqueada"], reacao: ["#0a7a6c", "só reagir"],
};
const uid = () => Math.random().toString(36).slice(2, 10);

function fromPending(p: PendingItem): Item {
  const c = (p.classification ?? {}) as Record<string, unknown>;
  return {
    id: p.messageId, raw: p.content, status: "pronta", externalUrl: p.externalUrl ?? undefined,
    connected: p.connected, conversationId: p.conversationId,
    res: p.responseId ? {
      conversationId: p.conversationId, messageId: p.messageId, responseId: p.responseId, version: p.version ?? 1,
      text: p.text ?? "", verdict: (p.verdict as ApiResult["verdict"]) ?? "aprovada", reason: p.reason ?? "", escalateTo: null, contacts: [],
      classification: {
        intent: (c.intent as string) ?? "outro", uf: (c.uf as string) ?? null, sentiment: (c.sentiment as string) ?? "neutro",
        summary: (c.summary as string) ?? "", flags: (c.flags as string[]) ?? [], surface: p.surface,
        audience: (c.audience as string) ?? "indefinido", businessType: (c.business_type as string) ?? null,
      },
      sources: { products: [], distributors: [], documents: [] }, scrub: {}, cleanText: p.content, latencyMs: 0,
    } : undefined,
  };
}

export function Fila({ brandName }: { brandName: string }) {
  const [bulk, setBulk] = useState("");
  const [channel, setChannel] = useState("instagram");
  const [surface, setSurface] = useState<"dm" | "comment">("dm");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [awaiting, setAwaiting] = useState<AwaitingItem[]>([]);
  const [awaitErr, setAwaitErr] = useState<Record<string, string>>({});

  useEffect(() => {
    pendingQueue().then((rows) => { setItems(rows.map(fromPending)); setLoaded(true); });
    awaitingPublication().then(setAwaiting);
  }, []);

  async function confirmOne(conversationId: string) {
    await confirmPublished(conversationId);
    setAwaiting((prev) => prev.filter((a) => a.conversationId !== conversationId));
  }

  /** Publica de fato no Meta (comentário ou DM) pelo canal conectado. */
  async function publishToMeta(conversationId: string, responseId: string, text: string) {
    const r = await fetch("/api/meta/publish", { method: "POST", body: JSON.stringify({ conversationId, responseId, text }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "falha ao publicar no Meta");
    return j.externalId as string;
  }

  async function publishAwaiting(a: AwaitingItem) {
    if (!a.responseId) return;
    try {
      await publishToMeta(a.conversationId, a.responseId, a.text ?? "");
      setAwaiting((prev) => prev.filter((x) => x.conversationId !== a.conversationId));
    } catch (e) {
      setAwaitErr((prev) => ({ ...prev, [a.conversationId]: e instanceof Error ? e.message : "falha ao publicar" }));
    }
  }

  async function process() {
    // cada bloco pode começar com "id: <numero>" OU com a URL inteira da aba do Meta — evita duplicar em varreduras futuras
    const blocks = bulk.split(/^\s*-{3,}\s*$/m).map((s) => s.trim()).filter(Boolean);
    const parsed = blocks.map((b) => {
      const lines = b.split("\n");
      const first = (lines[0] ?? "").trim();
      // "id: <numero>" digitado à mão — continua funcionando
      const explicit = first.match(/^id:\s*(\S+)$/i);
      if (explicit) return { raw: lines.slice(1).join("\n").trim(), externalThreadId: explicit[1] };
      // URL inteira colada na primeira linha — extrai o identificador e guarda o link, sem digitar nada
      if (/^https?:\/\//.test(first)) {
        const rest = lines.slice(1).join("\n").trim();
        const idMatch = first.match(/[?&](?:selected_item_id|item_id|thread_id|comment_id)=([\w.-]+)/i);
        return { raw: rest || first, externalThreadId: idMatch?.[1], externalUrl: first };
      }
      return { raw: b.trim(), externalThreadId: undefined, externalUrl: undefined };
    }).filter((p) => p.raw);
    if (!parsed.length) return;
    const fresh: Item[] = parsed.map((p) => ({ id: uid(), raw: p.raw, externalThreadId: p.externalThreadId, externalUrl: p.externalUrl, status: "carregando" }));
    setItems((prev) => [...fresh, ...prev]);
    setBulk(""); setBusy(true);
    await Promise.allSettled(fresh.map((it) => runOne(it.id, it.raw, it.externalThreadId, undefined, undefined, it.externalUrl)));
    setBusy(false);
  }

  async function runOne(id: string, text: string, externalThreadId?: string, conversationId?: string, messageId?: string, externalUrl?: string) {
    try {
      const r = await fetch("/api/respond", { method: "POST", body: JSON.stringify({ text, channel, surface, conversationId, messageId, externalThreadId, externalUrl }) });
      const j = await r.json();
      if (!r.ok) { setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "erro", error: j.error ?? "falha" } : it))); return; }
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "pronta", res: j, error: undefined } : it)));
    } catch {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "erro", error: "falha de rede" } : it)));
    }
  }

  /**
   * Item que chegou pelo webhook e ainda não tem sugestão.
   * conversationId E messageId vão juntos: sem isso o /api/respond abriria
   * um atendimento novo e a mensagem ficaria pendurada em duas conversas.
   */
  async function generate(it: Item) {
    if (!it.conversationId) return;
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, status: "carregando" } : x)));
    await runOne(it.id, it.raw, it.externalThreadId, it.conversationId, it.id, it.externalUrl);
  }

  async function regenerate(it: Item) {
    if (!it.res) return;
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, status: "carregando" } : x)));
    await fetch("/api/feedback", { method: "POST", body: JSON.stringify({ responseId: it.res.responseId, kind: "regerada" }) });
    await runOne(it.id, it.raw, it.externalThreadId, it.res.conversationId, it.res.messageId, it.externalUrl);
  }

  async function approve(it: Item) {
    if (!it.res) return;
    // Canal conectado: publica direto pela API. Varredura manual: copia para o operador colar.
    if (it.connected && it.res.verdict !== "reacao") {
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, status: "carregando" } : x)));
      try {
        await publishToMeta(it.res.conversationId, it.res.responseId, it.res.text);
      } catch (e) {
        setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, status: "pronta", error: e instanceof Error ? e.message : "falha ao publicar" } : x)));
        return;
      }
    } else {
      await navigator.clipboard.writeText(it.res.text);
    }
    await fetch("/api/feedback", { method: "POST", body: JSON.stringify({ responseId: it.res.responseId, kind: "copiada" }) });
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, status: "aprovada", error: undefined } : x)));
  }

  async function reject(it: Item) {
    if (!it.res) return;
    await fetch("/api/feedback", { method: "POST", body: JSON.stringify({ responseId: it.res.responseId, kind: "reprovada" }) });
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, status: "reprovada" } : x)));
  }
  function dismiss(id: string) { setItems((prev) => prev.filter((x) => x.id !== id)); }

  const pending = items.filter((i) => i.status === "carregando" || i.status === "pronta" || i.status === "erro");
  const done = items.filter((i) => i.status === "aprovada" || i.status === "reprovada");

  return (
    <div>
      <div className="panel">
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <label className="muted">Canal <select value={channel} onChange={(e) => setChannel(e.target.value)} style={{ marginLeft: 6, padding: 6, borderRadius: 6, border: "1px solid var(--line)" }}>
            <option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="whatsapp">WhatsApp</option><option value="outro">Outro</option>
          </select></label>
          <label className="muted">Onde <select value={surface} onChange={(e) => setSurface(e.target.value as "dm" | "comment")} style={{ marginLeft: 6, padding: 6, borderRadius: 6, border: "1px solid var(--line)" }}>
            <option value="dm">Mensagem direta</option><option value="comment">Comentário público</option>
          </select></label>
          <span className="muted">vale para as mensagens coladas abaixo — o que chega pelo canal conectado já vem marcado</span>
        </div>
        <textarea className="paste" value={bulk} onChange={(e) => setBulk(e.target.value)}
          placeholder={`Cole várias mensagens recebidas por ${brandName}, uma por bloco, separadas por uma linha com ---\nOpcional: cole a URL da aba do Meta como primeira linha do bloco — o identificador do tópico é extraído sozinho, não precisa digitar nada.\n\nEx.:\nhttps://business.facebook.com/latest/inbox/...&selected_item_id=340282366841710301244259604207492832011\ntem álcool? qual o grau?\n---\nnão encontro em Duque de Caxias, RJ`}
          style={{ minHeight: 160 }} disabled={busy} />
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={process} disabled={busy || !bulk.trim()}>{busy ? "Gerando…" : "Gerar respostas"}</button>
        </div>
      </div>

      {!loaded && <p className="muted">Carregando fila…</p>}
      {loaded && pending.length > 0 && (
        <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
          {pending.map((it) => <Card key={it.id} it={it} onApprove={approve} onReject={reject} onRegenerate={regenerate} onGenerate={generate} onDismiss={dismiss} />)}
        </div>
      )}
      {loaded && !pending.length && !done.length && <p className="muted">Nenhuma mensagem pendente. Cole acima e clique em Gerar respostas — ou aguarde a próxima varredura.</p>}

      {awaiting.length > 0 && (
        <div className="panel" style={{ borderLeft: "4px solid #0a4d8c" }}>
          <h3 style={{ marginBottom: 4 }}>Aguardando publicação ({awaiting.length})</h3>
          <p className="muted" style={{ marginBottom: 12 }}>Liberadas pelo operador, mas ainda sem confirmação de que saíram no Meta.</p>
          <div style={{ display: "grid", gap: 10 }}>
            {awaiting.map((a) => (
              <div key={a.conversationId} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
                  &quot;{a.content}&quot;
                  {a.externalUrl && <> · <a href={a.externalUrl} target="_blank" rel="noopener noreferrer">abrir no Meta ↗</a></>}
                </div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: a.verdict === "reacao" ? 26 : 14, marginBottom: 8 }}>{a.text}</div>
                {awaitErr[a.conversationId] && <p className="error" style={{ marginBottom: 8 }}>{awaitErr[a.conversationId]}</p>}
                {a.connected && a.verdict !== "reacao"
                  ? <button className="btn" onClick={() => publishAwaiting(a)}>Publicar no Meta</button>
                  : <button className="btn" onClick={() => confirmOne(a.conversationId)}>Confirmar publicado</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {done.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="muted">Concluídas nesta sessão ({done.length})</summary>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {done.map((it) => <Card key={it.id} it={it} onApprove={approve} onReject={reject} onRegenerate={regenerate} onGenerate={generate} onDismiss={dismiss} compact />)}
          </div>
        </details>
      )}
    </div>
  );
}

function Card({ it, onApprove, onReject, onRegenerate, onGenerate, onDismiss, compact }: {
  it: Item; onApprove: (i: Item) => void; onReject: (i: Item) => void; onRegenerate: (i: Item) => void;
  onGenerate: (i: Item) => void; onDismiss: (id: string) => void; compact?: boolean;
}) {
  const badge = it.res ? BADGE[it.res.verdict] : null;
  return (
    <div className="panel" style={{ margin: 0, opacity: compact ? 0.7 : 1, borderLeft: badge ? `4px solid ${badge[0]}` : undefined }}>
      <div className="muted" style={{ fontSize: 13, marginBottom: 8, whiteSpace: "pre-wrap" }}>
        {it.connected && <span title="chegou pelo canal conectado" style={{ marginRight: 6 }}>🔗</span>}
        &quot;{it.raw}&quot;
        {it.externalUrl && <> · <a href={it.externalUrl} target="_blank" rel="noopener noreferrer">abrir no Meta ↗</a></>}
      </div>

      {it.status === "carregando" && <p className="muted">Processando…</p>}
      {it.status === "erro" && <p className="error">{it.error}</p>}

      {/* Chegou pelo webhook e ainda não tem sugestão */}
      {!it.res && it.status === "pronta" && (
        <button className="btn" onClick={() => onGenerate(it)}>Gerar resposta</button>
      )}

      {it.res && (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ color: badge![0], fontWeight: 600, fontSize: 13 }}>{badge![1]}</span>
            <span className="muted" style={{ fontSize: 13 }}>· {INTENT[it.res.classification.intent] ?? it.res.classification.intent}{it.res.classification.uf ? ` · ${it.res.classification.uf}` : ""}{it.res.classification.audience === "b2b" ? ` · B2B${it.res.classification.businessType ? " " + it.res.classification.businessType : ""}` : ""}</span>
          </div>
          {it.res.classification.flags?.length > 0 && <p className="muted" style={{ marginBottom: 8, color: "#7a4a00" }}>⚠ {it.res.classification.flags.join(", ")}</p>}
          {it.res.verdict === "reacao" && <p className="muted" style={{ marginBottom: 6 }}>Elogio sem nada específico — clique no emoji do comentário no Meta em vez de escrever.</p>}
          <div style={{ whiteSpace: "pre-wrap", fontSize: it.res.verdict === "reacao" ? 32 : 15, lineHeight: 1.5, marginBottom: 10 }}>{it.res.text}</div>
          {it.status === "aprovada" && <p style={{ color: "#1b7f4b", fontSize: 13, marginBottom: 8 }}>✓ {it.res.verdict === "reacao" ? "Registrada" : it.connected ? "Publicada no Meta" : "Copiada — cole no Meta"}</p>}
          {it.status === "reprovada" && <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Reprovada, atendimento encerrado</p>}
          {(it.status === "pronta") && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => onApprove(it)}>
                {it.res.verdict === "reacao" ? "Registrar reação" : it.connected ? "Publicar no Meta" : "Liberar publicação"}
              </button>
              <button onClick={() => onRegenerate(it)} style={btn()}>Regenerar</button>
              <button onClick={() => onReject(it)} style={btn()}>Reprovar</button>
            </div>
          )}
          {compact && <button onClick={() => onDismiss(it.id)} className="muted" style={{ background: "none", border: "none", textDecoration: "underline", cursor: "pointer", fontSize: 13, marginTop: 6 }}>remover da lista</button>}
        </>
      )}
    </div>
  );
}
function btn(): React.CSSProperties { return { background: "transparent", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 14px", cursor: "pointer" }; }
