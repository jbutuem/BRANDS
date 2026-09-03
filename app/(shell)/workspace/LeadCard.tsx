"use client";
import { useState } from "react";

type Contact = { id: string; kind: string; name: string; email: string | null; whatsapp: string | null };
type Props = {
  brandName: string; conversationId: string; channel: string;
  prefill: { businessType: string | null; businessName: string | null; city: string | null; uf: string | null; products: string[]; leadSignals: string[]; summary: string };
  commercial: Contact[];
};
const inp: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 6, padding: 8, width: "100%" };

export function LeadCard({ brandName, conversationId, channel, prefill, commercial }: Props) {
  const [f, setF] = useState({
    businessName: prefill.businessName ?? "", businessType: prefill.businessType ?? "", city: prefill.city ?? "", uf: prefill.uf ?? "",
    interest: prefill.products.join(", "), estVolume: "", commercialSent: commercial.length > 0, notes: prefill.summary,
  });
  const [saved, setSaved] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });

  async function save() {
    setErr(null);
    const r = await fetch("/api/leads", { method: "POST", body: JSON.stringify({ ...f, interest: f.interest.split(",").map((s) => s.trim()).filter(Boolean), conversationId, channel }) });
    const j = await r.json();
    if (!r.ok) { setErr(j.error); return; }
    setSaved(j.id);
  }
  const brief = `Oportunidade ${brandName} via ${channel}\nNegócio: ${f.businessName || "—"} (${f.businessType || "—"}) — ${f.city || "—"}/${f.uf || "—"}\nInteresse: ${f.interest || "—"} · Volume: ${f.estVolume || "—"}\nResumo: ${f.notes}\n(O cliente recebeu o contato do comercial e deve procurar. Sem dados pessoais registrados.)`;

  return (
    <div className="panel" style={{ borderLeft: "4px solid #1b7f4b" }}>
      <h3 style={{ marginBottom: 4 }}>Registrar oportunidade</h3>
      <p className="muted" style={{ marginBottom: 12 }}>Conversa identificada como negócio{prefill.leadSignals.length ? ` · sinais: ${prefill.leadSignals.join(", ")}` : ""}. Só o perfil do negócio é guardado — nenhum dado da pessoa. O contato do comercial vai na resposta; quem procura é o cliente.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px", gap: 8, marginBottom: 8 }}>
        <input placeholder="Nome do negócio (opcional)" value={f.businessName} onChange={set("businessName")} style={inp} />
        <select value={f.businessType} onChange={set("businessType")} style={inp}>
          <option value="">Tipo de negócio</option>
          {["hamburgueria", "cafeteria", "restaurante", "padaria", "hotel", "bar", "food truck", "dark kitchen", "sorveteria", "distribuidor", "revenda", "outro"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input placeholder="Cidade" value={f.city} onChange={set("city")} style={inp} />
        <input placeholder="UF" value={f.uf} onChange={set("uf")} maxLength={2} style={inp} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginBottom: 8 }}>
        <input placeholder="Interesse (produtos/linhas, separados por vírgula)" value={f.interest} onChange={set("interest")} style={inp} />
        <input placeholder="Volume estimado (ex.: 20 kg/mês)" value={f.estVolume} onChange={set("estVolume")} style={inp} />
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "6px 0", fontSize: 14 }}>
        <input type="checkbox" checked={f.commercialSent} onChange={set("commercialSent")} />
        Contato do comercial foi passado ao cliente na resposta
      </label>
      <textarea placeholder="Resumo / observações" value={f.notes} onChange={set("notes")} style={{ ...inp, minHeight: 60, marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {!saved ? <button className="btn" onClick={save} disabled={!f.businessType && !f.businessName}>Salvar oportunidade</button> : <span style={{ color: "#1b7f4b", fontWeight: 600 }}>✓ Oportunidade salva</span>}
        {saved && commercial.map((c) => (
          <span key={c.id} className="muted">avisar {c.name}: {c.whatsapp && <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(brief)}`} target="_blank">WhatsApp</a>}{c.whatsapp && c.email && " · "}{c.email && <a href={`mailto:${c.email}?subject=${encodeURIComponent(`[Oportunidade ${brandName}] ${f.businessName || f.businessType}`)}&body=${encodeURIComponent(brief)}`}>e-mail</a>}</span>
        ))}
        {!commercial.length && <span className="muted">Cadastre um contato comercial na Configuração — sem ele a resposta B2B não tem para onde apontar.</span>}
        {err && <span className="error">{err}</span>}
      </div>
    </div>
  );
}
