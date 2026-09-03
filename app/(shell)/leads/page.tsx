import { getSession } from "@/lib/brand";
import { LeadRow } from "./LeadRow";

export const dynamic = "force-dynamic";

export default async function Leads() {
  const { sb, active } = await getSession();
  const [{ data: leads }, { data: contacts }] = await Promise.all([
    sb.from("leads").select("id, business_name, business_type, city, uf, interest, est_volume, commercial_sent, status, assigned_to, notes, channel, created_at").eq("brand_id", active!.id).order("created_at", { ascending: false }).limit(200),
    sb.from("internal_contacts").select("id, name, kind").eq("brand_id", active!.id).eq("kind", "comercial").eq("is_active", true),
  ]);
  const byStatus = (s: string) => (leads ?? []).filter((l) => l.status === s).length;
  const csv = ["data;negocio;tipo;cidade;uf;interesse;volume;contato_comercial_enviado;status;canal;obs",
    ...(leads ?? []).map((l) => [new Date(l.created_at).toLocaleDateString("pt-BR"), l.business_name, l.business_type, l.city, l.uf, (l.interest ?? []).join("|"), l.est_volume, l.commercial_sent ? "sim" : "não", l.status, l.channel, (l.notes ?? "").replace(/[\r\n;]+/g, " ")].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))].join("\n");
  return (
    <div key={active!.id}>
      <h2>Leads</h2>
      <p className="lede">Negócios identificados nas conversas de {active!.name}. Só o perfil do negócio é guardado; o cliente recebe o contato do comercial e procura.</p>
      <div className="panel stat">
        <div><b>{leads?.length ?? 0}</b><span>total</span></div>
        <div><b>{byStatus("novo")}</b><span>novos</span></div>
        <div><b>{byStatus("contatado")}</b><span>contatados</span></div>
        <div><b>{byStatus("qualificado")}</b><span>qualificados</span></div>
        <div><b>{byStatus("convertido")}</b><span>convertidos</span></div>
        <div style={{ marginLeft: "auto" }}><a className="btn" style={{ textDecoration: "none", display: "inline-block" }} href={`data:text/csv;charset=utf-8,\uFEFF${encodeURIComponent(csv)}`} download={`leads-${active!.slug}.csv`}>Exportar CSV</a></div>
      </div>
      <div className="panel">
        {!leads?.length ? <p>Nenhum lead ainda. Eles nascem na tela Responder quando a conversa é identificada como negócio.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ textAlign: "left", color: "var(--ink-2)" }}><th style={{ padding: "6px 0" }}>Negócio</th><th>Local</th><th>Interesse</th><th>Comercial</th><th>Status</th><th>Responsável</th></tr></thead>
            <tbody>{leads.map((l) => <LeadRow key={l.id} lead={l} commercial={contacts ?? []} />)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
