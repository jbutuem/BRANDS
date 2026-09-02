import { getSession } from "@/lib/brand";

export default async function Aprendizado() {
  const { sb, active } = await getSession();
  const [docs, products, dists, contacts] = await Promise.all([
    sb.from("documents").select("*", { count: "exact", head: true }).eq("brand_id", active!.id),
    sb.from("products").select("*", { count: "exact", head: true }).eq("brand_id", active!.id),
    sb.from("distributors").select("*", { count: "exact", head: true }).eq("brand_id", active!.id),
    sb.from("internal_contacts").select("*", { count: "exact", head: true }).eq("brand_id", active!.id),
  ]);
  return (
    <>
      <h2>Aprendizado</h2>
      <p className="lede">Tudo que a marca sabe fica aqui: catálogos, tabelas nutricionais, distribuidores por região e contatos internos para encaminhamento.</p>
      <div className="panel stat">
        <div><b>{docs.count ?? 0}</b><span>documentos</span></div>
        <div><b>{products.count ?? 0}</b><span>produtos</span></div>
        <div><b>{dists.count ?? 0}</b><span>distribuidores</span></div>
        <div><b>{contacts.count ?? 0}</b><span>contatos internos</span></div>
      </div>
      <div className="panel">
        <h3>Enviar arquivos</h3>
        <p>Upload de PDF, PPTX, XLSX, DOCX e texto entra no Sprint 2, junto com a importação automática de catálogos e distribuidores.</p>
      </div>
    </>
  );
}
