import { getSession } from "@/lib/brand";
import { Uploader } from "./Uploader";
import { SearchTest } from "./SearchTest";
import { DocRow } from "./DocRow";
import { Notes } from "./Notes";
import { AutoRefresh } from "./AutoRefresh";
import { Golden, type Candidata } from "./Golden";

export const dynamic = "force-dynamic";

export default async function Aprendizado() {
  const { sb, active, role } = await getSession();
  const canEdit = role === "admin" || role === "brand_manager";
  const [docs, products, dists, contacts, chunks, notes, candidatas, referencias, lacunas] = await Promise.all([
    sb.from("documents").select("id, name, file_type, status, pages, chunk_count, error, created_at").eq("brand_id", active!.id).order("created_at", { ascending: false }),
    sb.from("products").select("*", { count: "exact", head: true }).eq("brand_id", active!.id),
    sb.from("distributors").select("*", { count: "exact", head: true }).eq("brand_id", active!.id),
    sb.from("internal_contacts").select("*", { count: "exact", head: true }).eq("brand_id", active!.id),
    sb.from("document_chunks").select("*", { count: "exact", head: true }).eq("brand_id", active!.id),
    sb.from("brand_notes").select("id, kind, title, body, created_at").eq("brand_id", active!.id).eq("is_active", true).order("created_at", { ascending: false }),
    sb.from("golden_candidates").select("id, question, answer, intent, operator_hint, created_at").eq("brand_id", active!.id).eq("status", "pendente").order("created_at", { ascending: false }).limit(30),
    sb.from("golden_responses").select("*", { count: "exact", head: true }).eq("brand_id", active!.id),
    sb.from("knowledge_gaps").select("gap_type, detail, count, last_seen").eq("brand_id", active!.id).order("count", { ascending: false }).limit(20),
  ]);
  const pending = (docs.data ?? []).some((d) => d.status !== "ready" && d.status !== "error");
  const gaps = lacunas.data ?? [];
  const GAP_LABEL: Record<string, string> = {
    uf_sem_distribuidor: "estado sem distribuidor cadastrado",
    produto_nao_encontrado: "produto não encontrado na base",
    sem_material_tecnico: "sem material sobre o tema",
  };
  // key={active.id}: ao trocar de marca, TODO estado de tela (resultados de busca,
  // progresso de upload) é descartado. Nada de uma marca sobrevive na tela da outra.
  return (
    <div key={active!.id}>
      <AutoRefresh pending={pending} />
      <h2>Aprendizado</h2>
      <p className="lede">Tudo que {active!.name} sabe fica aqui: catálogos, tabelas nutricionais, distribuidores por região e contatos internos para encaminhamento.</p>

      <div className="panel stat">
        <div><b>{products.count ?? 0}</b><span>produtos</span></div>
        <div><b>{dists.count ?? 0}</b><span>distribuidores</span></div>
        <div><b>{docs.data?.length ?? 0}</b><span>documentos</span></div>
        <div><b>{chunks.count ?? 0}</b><span>trechos indexados</span></div>
        <div><b>{notes.data?.length ?? 0}</b><span>anotações</span></div>
        <div><b>{referencias.count ?? 0}</b><span>respostas de referência</span></div>
        <div><b>{contacts.count ?? 0}</b><span>contatos internos</span></div>
      </div>

      <Golden candidatas={(candidatas.data ?? []) as Candidata[]} canEdit={canEdit} />

      <Notes notes={notes.data ?? []} canEdit={canEdit} />

      {gaps.length > 0 && (
        <div className="panel" style={{ borderLeft: "4px solid #7a4a00" }}>
          <h3>O que faltou responder</h3>
          <p className="lede" style={{ marginBottom: 10 }}>
            Momentos em que o Redator procurou algo e não achou na base. Cada linha é um
            material que vale cadastrar.
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ textAlign: "left", color: "var(--ink-2)" }}><th style={{ padding: "6px 0" }}>Tipo</th><th>Detalhe</th><th>Vezes</th></tr></thead>
            <tbody>
              {gaps.map((g, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "6px 0" }}>{GAP_LABEL[g.gap_type] ?? g.gap_type}</td>
                  <td>{g.detail}</td>
                  <td>{g.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <div className="panel">
          <h3>Enviar arquivo</h3>
          <p style={{ marginBottom: 12 }}>PDF, Word, PowerPoint, Excel, imagem (JPG, PNG, WEBP) ou texto. PDFs e imagens que são só arte — catálogo, lâmina, print de rótulo — também funcionam: a leitura é feita por transcrição visual.</p>
          <Uploader key={`up-${active!.id}`} brandId={active!.id} brandSlug={active!.slug} />
        </div>
      )}

      <div className="panel">
        <h3>Documentos</h3>
        {pending && <p className="muted" style={{ marginBottom: 8 }}>Indexando os documentos recém-enviados — esta lista atualiza sozinha. Só teste perguntas sobre eles depois que o status virar &quot;pronto&quot;.</p>}
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
