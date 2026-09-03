"use client";
import { useState } from "react";

type Lead = { id: string; business_name: string | null; business_type: string | null; city: string | null; uf: string | null; interest: string[]; est_volume: string | null; commercial_sent: boolean; status: string; assigned_to: string | null; notes: string | null; channel: string | null; created_at: string };
const STATUS = ["novo", "contatado", "qualificado", "convertido", "perdido"];

export function LeadRow({ lead, commercial }: { lead: Lead; commercial: { id: string; name: string }[] }) {
  const [status, setStatus] = useState(lead.status);
  const [assigned, setAssigned] = useState(lead.assigned_to ?? "");
  const [open, setOpen] = useState(false);
  async function patch(p: Record<string, unknown>) { await fetch("/api/leads", { method: "PATCH", body: JSON.stringify({ id: lead.id, ...p }) }); }
  return (
    <>
      <tr style={{ borderTop: "1px solid var(--line)", cursor: "pointer" }} onClick={() => setOpen(!open)}>
        <td style={{ padding: "8px 0" }}><b>{lead.business_name || "—"}</b><div className="muted">{lead.business_type} · {new Date(lead.created_at).toLocaleDateString("pt-BR")} · {lead.channel}</div></td>
        <td>{[lead.city, lead.uf].filter(Boolean).join("/") || "—"}</td>
        <td className="muted">{(lead.interest ?? []).join(", ") || "—"}{lead.est_volume ? ` · ${lead.est_volume}` : ""}</td>
        <td className="muted">{lead.commercial_sent ? "contato enviado ao cliente" : "—"}</td>
        <td onClick={(e) => e.stopPropagation()}><select value={status} onChange={(e) => { setStatus(e.target.value); patch({ status: e.target.value }); }} style={{ padding: 4, borderRadius: 6, border: "1px solid var(--line)" }}>{STATUS.map((s) => <option key={s} value={s}>{s}</option>)}</select></td>
        <td onClick={(e) => e.stopPropagation()}><select value={assigned} onChange={(e) => { setAssigned(e.target.value); patch({ assignedTo: e.target.value }); }} style={{ padding: 4, borderRadius: 6, border: "1px solid var(--line)" }}><option value="">—</option>{commercial.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
      </tr>
      {open && <tr><td colSpan={6} style={{ padding: "4px 0 10px" }} className="muted">{lead.notes || "(sem observações)"}</td></tr>}
    </>
  );
}
