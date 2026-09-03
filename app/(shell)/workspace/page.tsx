import { getSession } from "@/lib/brand";
import { Responder } from "./Responder";

export const dynamic = "force-dynamic";

export default async function Workspace() {
  const { sb, active } = await getSession();
  const [{ count }, gaps] = await Promise.all([
    sb.from("conversations").select("*", { count: "exact", head: true }).eq("brand_id", active!.id),
    sb.from("knowledge_gaps").select("gap_type, detail, count").eq("brand_id", active!.id).order("count", { ascending: false }).limit(5),
  ]);
  return (
    <div key={active!.id}>
      <h2>Responder</h2>
      <p className="lede">Cole só o texto da mensagem — sem nome, @ ou telefone do cliente. O que passar é removido automaticamente antes de ser guardado.</p>
      <Responder brandName={active!.name} />
      <div className="panel stat">
        <div><b>{count ?? 0}</b><span>conversas em {active!.name}</span></div>
        {gaps.data?.length ? <div><b>{gaps.data.length}</b><span>lacunas de base: {gaps.data.map((g) => `${g.gap_type.replace(/_/g, " ")} (${g.detail})`).join(" · ")}</span></div> : null}
      </div>
    </div>
  );
}
