import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  chunkText, extractDocx, extractPdfViaClaude, extractPptx, extractXlsx,
  extractImageViaClaude, IMAGEM_MIME, TEXTO_SIMPLES, type Chunk,
} from "@/lib/ingest";

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

  // O tipo vem do cadastro, mas a extensão do arquivo é a fonte mais confiável.
  const ext = (doc.storage_path?.split(".").pop() ?? doc.file_type ?? "").toLowerCase();
  const tipo = (doc.file_type ?? ext).toLowerCase();

  try {
    let chunks: Chunk[] = [];
    let pages: number | null = null;

    if (tipo === "pdf" || ext === "pdf") {
      const { data: signed, error } = await sb.storage.from(bucket).createSignedUrl(doc.storage_path, 3600);
      if (error || !signed) throw new Error("não foi possível gerar URL do arquivo");
      const { pages: pg } = await extractPdfViaClaude(signed.signedUrl);
      pages = pg.length;
      pg.forEach((t, i) => { chunks.push(...chunkText(t, i + 1)); });
    } else {
      const { data: file, error } = await sb.storage.from(bucket).download(doc.storage_path);
      if (error || !file) throw new Error("não foi possível baixar o arquivo");
      const buf = Buffer.from(await file.arrayBuffer());

      if (tipo === "docx" || ext === "docx") {
        chunks = chunkText(await extractDocx(buf), null);
      } else if (tipo === "pptx" || ext === "pptx") {
        const s = await extractPptx(buf); pages = s.length;
        s.forEach((t, i) => chunks.push(...chunkText(t, i + 1)));
      } else if (tipo === "xlsx" || ext === "xlsx") {
        const s = extractXlsx(buf);
        s.forEach((t, i) => chunks.push(...chunkText(t, i + 1)));
      } else if (IMAGEM_MIME[ext]) {
        // Print de rótulo, foto de tabela, arte de post: transcrição por visão.
        chunks = chunkText(await extractImageViaClaude(buf, ext), null);
        pages = 1;
      } else if (TEXTO_SIMPLES.includes(ext)) {
        chunks = chunkText(buf.toString("utf8"), null);
      } else {
        // Antes qualquer binário caía num toString("utf8") e virava lixo silencioso.
        throw new Error(
          `formato .${ext || "desconhecido"} não é suportado. ` +
          `Aceitos: PDF, DOCX, PPTX, XLSX, imagem (JPG, PNG, GIF, WEBP) e texto (TXT, MD, CSV, JSON, HTML).`
        );
      }
    }

    chunks = chunks.filter((c) => c.content.replace(/\(sem texto\)/g, "").trim().length > 20);

    // Zero trecho nunca é "pronto": antes o documento ficava verde na tela sem
    // nada indexado, e ninguém descobria até a resposta sair sem fundamento.
    if (!chunks.length) {
      throw new Error("nenhum texto aproveitável foi extraído — confira se o arquivo tem conteúdo legível");
    }

    await sb.from("document_chunks").delete().eq("document_id", doc.id);
    const { error } = await sb.from("document_chunks").insert(
      chunks.map((c) => ({ document_id: doc.id, brand_id: doc.brand_id, content: c.content, page: c.page }))
    );
    if (error) throw new Error(error.message);

    await sb.from("documents").update({ status: "ready", pages, chunk_count: chunks.length }).eq("id", doc.id);
    return NextResponse.json({ ok: true, chunks: chunks.length, pages });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("documents").update({ status: "error", error: msg, chunk_count: 0 }).eq("id", doc.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
