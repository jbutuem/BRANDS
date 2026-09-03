import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { chunkText, extractDocx, extractPdfViaClaude, extractPptx, extractXlsx, type Chunk } from "@/lib/ingest";

export const maxDuration = 300; // PDFs grandes via Claude podem levar alguns minutos
export const runtime = "nodejs";

/**
 * POST { documentId } — processa um documento já enviado ao Storage.
 * Toda leitura/escrita usa o token do usuário: a RLS garante que só
 * documentos da marca do usuário são processados.
 */
export async function POST(req: Request) {
  const { documentId } = await req.json();
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const { data: doc } = await sb.from("documents").select("*, brands!inner(slug)").eq("id", documentId).maybeSingle();
  if (!doc) return NextResponse.json({ error: "documento não encontrado" }, { status: 404 });

  const bucket = `brand-${(doc.brands as { slug: string }).slug}`;
  await sb.from("documents").update({ status: "processing", error: null }).eq("id", doc.id);

  try {
    let chunks: Chunk[] = [];
    let pages: number | null = null;

    if (doc.file_type === "pdf") {
      const { data: signed, error } = await sb.storage.from(bucket).createSignedUrl(doc.storage_path, 3600);
      if (error || !signed) throw new Error("não foi possível gerar URL do arquivo");
      const { pages: pg } = await extractPdfViaClaude(signed.signedUrl);
      pages = pg.length;
      pg.forEach((t, i) => { chunks.push(...chunkText(t, i + 1)); });
    } else {
      const { data: file, error } = await sb.storage.from(bucket).download(doc.storage_path);
      if (error || !file) throw new Error("não foi possível baixar o arquivo");
      const buf = Buffer.from(await file.arrayBuffer());
      if (doc.file_type === "docx") chunks = chunkText(await extractDocx(buf), null);
      else if (doc.file_type === "pptx") { const s = await extractPptx(buf); pages = s.length; s.forEach((t, i) => chunks.push(...chunkText(t, i + 1))); }
      else if (doc.file_type === "xlsx") { const s = extractXlsx(buf); s.forEach((t, i) => chunks.push(...chunkText(t, i + 1))); }
      else chunks = chunkText(buf.toString("utf8"), null);
    }

    chunks = chunks.filter((c) => c.content.replace(/\(sem texto\)/g, "").trim().length > 20);

    await sb.from("document_chunks").delete().eq("document_id", doc.id);
    if (chunks.length) {
      const { error } = await sb.from("document_chunks").insert(
        chunks.map((c) => ({ document_id: doc.id, brand_id: doc.brand_id, content: c.content, page: c.page }))
      );
      if (error) throw new Error(error.message);
    }
    await sb.from("documents").update({ status: "ready", pages, chunk_count: chunks.length }).eq("id", doc.id);
    return NextResponse.json({ ok: true, chunks: chunks.length, pages });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("documents").update({ status: "error", error: msg }).eq("id", doc.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
