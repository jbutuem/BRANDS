import { getSession } from "@/lib/brand";
import { Uploader } from "./Uploader";
import { SearchTest } from "./SearchTest";
import { DocRow } from "./DocRow";
import { Notes } from "./Notes";

export const dynamic = "force-dynamic";

export default async function Aprendizado() {
  const { sb, active, role } = await getSession();
  const canEdit = role === "admin" || role === "brand_manager";
  const [docs, products, dists, contacts, chunks, notes] = await Promise.all([
    sb.from("documents").select("id, name, file_type, status, pages, chunk_count, error, created_at").eq("brand_id", active!.id).order("created_at", { ascending: false }),
    sb.from("products").select("*", { count: "exact", head: true }).eq("brand_id", active!.id),
    sb.from("distributors").select("*", { count: "exact", head: true }).eq("brand_id", active!.id),
    sb.from("internal_contacts").select("*", { count: "exact", head: true }).eq("brand_id", active!.id),
    sb.from("document_chunks").select("*", { count: "exact", head: true }).eq("brand_id", active!.id),
    sb.from("brand_notes").select("id, kind, title, body, created_at").eq("brand_id", active!.id).eq("is_active", true).order("created_at", { ascending: false }),
  ]);
  // key={active.id}: ao trocar de marca, TODO estado de tela (resultados de busca,
  // progresso de upload) é descartado. Nada de uma marca sobrevive na tela da outra.
  return (
    <div key={active!.id}>
      <h2>Aprendizado</h2>
      <p className="lede">Tudo que {active!.name} sabe fica aqui: catálogos, tabelas nutricionais, distribuidores por região e contatos internos para encaminhamento.</p>

      <div className="panel stat">
        <div><b>{products.count ?? 0}</b><span>produtos</span></div>
        <div><b>{dists.count ?? 0}</b><span>distribuidores</span></div>
        <div><b>{docs.data?.length ?? 0}</b><span>documentos</span></div>
        <div><b>{chunks.count ?? 0}</b><span>trechos indexados</span></div>
        <div><b>{notes.data?.length ?? 0}</b><span>anotações</span></div>
        <div><b>{contacts.count ?? 0}</b><span>contatos internos</span></div>
      </div>

      <Notes notes={notes.data ?? []} canEdit={canEdit} />

      {canEdit && (
        <div className="panel">
          <h3>Enviar arquivo</h3>
          <p style={{ marginBottom: 12 }}>PDF, Word, PowerPoint, Excel ou texto. PDFs que são só imagem (como os catálogos) também funcionam: a leitura é feita página por página.</p>
          <Uploader key={`up-${active!.id}`} brandId={active!.id} brandSlug={active!.slug} />
        </div>
      )}

      <div className="panel">
        <h3>Documentos</h3>
        {!docs.data?.length ? <p>Nenhum documento ainda.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ textAlign: "left", color: "var(--ink-2)" }}><th style={{ padding: "6px 0" }}>Arquivo</th><th>Status</th><th>Páginas</th><th>Trechos</th><th></th></tr></thead>
            <tbody>{docs.data.map((d) => <DocRow key={d.id} doc={d} canEdit={canEdit} />)}</tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h3>Testar o que {active!.name} sabe</h3>
        <p style={{ marginBottom: 12 }}>Faça uma pergunta como um cliente faria. É a mesma busca que o Redator vai usar.</p>
        <SearchTest key={`search-${active!.id}`} brandName={active!.name} />
      </div>
    </div>
  );
}
