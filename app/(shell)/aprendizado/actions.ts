"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/brand";
import { detectUf } from "@/lib/uf";

export type SearchResult = {
  products: { id: string; name: string; codigo: string | null; packaging: string | null; shelf_life: string | null; status: string }[];
  distributors: { id: string; fantasia: string; cidade: string | null; ufs: string[]; whatsapp: string | null; telefone: string | null; email: string | null }[];
  chunks: { chunk_id: string; document_name: string; content: string; page: number | null }[];
};

/** Busca combinada: estruturado primeiro, texto depois. brand_id sempre da sessão. */
export async function searchKnowledge(q: string): Promise<SearchResult> {
  const { sb, active } = await getSession();
  const brandId = active!.id;
  const uf = detectUf(q);
  const [p, d, c] = await Promise.all([
    sb.rpc("search_products", { p_brand_id: brandId, p_query: q, p_limit: 8 }),
    uf ? sb.rpc("distributors_by_uf", { p_brand_id: brandId, p_uf: uf }) : Promise.resolve({ data: [] }),
    sb.rpc("search_chunks", { p_brand_id: brandId, p_query: q, p_limit: 6 }),
  ]);
  return { products: p.data ?? [], distributors: d.data ?? [], chunks: c.data ?? [] };
}

export async function deleteDocument(id: string) {
  const { sb, active } = await getSession();
  const { data: doc } = await sb.from("documents").select("storage_path").eq("id", id).maybeSingle();
  if (doc) {
    await sb.storage.from(`brand-${active!.slug}`).remove([doc.storage_path]);
    await sb.from("documents").delete().eq("id", id);
  }
  revalidatePath("/aprendizado");
}

export async function reprocessDocument(id: string) {
  const { sb } = await getSession();
  await sb.from("documents").update({ status: "processing", error: null }).eq("id", id);
  revalidatePath("/aprendizado");
}

export async function addNote(kind: string, title: string, body: string) {
  const { sb, active, user } = await getSession();
  await sb.from("brand_notes").insert({ brand_id: active!.id, kind, title: title.trim() || null, body: body.trim(), created_by: user.id });
  revalidatePath("/aprendizado");
}

export async function removeNote(id: string) {
  const { sb } = await getSession();
  await sb.from("brand_notes").update({ is_active: false }).eq("id", id);
  revalidatePath("/aprendizado");
}
