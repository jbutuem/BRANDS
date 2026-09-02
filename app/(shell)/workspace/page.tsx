import { getSession } from "@/lib/brand";

export default async function Workspace() {
  const { sb, active } = await getSession();
  const { count } = await sb.from("conversations").select("*", { count: "exact", head: true }).eq("brand_id", active!.id);

  return (
    <>
      <h2>Responder</h2>
      <p className="lede">
        Cole abaixo só o texto da mensagem recebida — sem nome, @ ou telefone do cliente. O que você colar
        passa por uma limpeza automática antes de ser guardado.
      </p>
      <div className="panel">
        <textarea className="paste" placeholder="Cole aqui a mensagem do cliente…" disabled />
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
          <button className="btn" disabled>Gerar resposta</button>
          <span className="muted">A geração de respostas entra no Sprint 3. Por enquanto esta tela só confirma o acesso à marca.</span>
        </div>
      </div>
      <div className="panel stat">
        <div><b>{count ?? 0}</b><span>conversas registradas em {active!.name}</span></div>
      </div>
    </>
  );
}
