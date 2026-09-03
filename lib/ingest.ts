import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import JSZip from "jszip";
import * as XLSX from "xlsx";

export type Chunk = { content: string; page: number | null };

const MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5";

/** PDFs (inclusive os que são só imagem) passam pelo Claude via URL assinada. */
export async function extractPdfViaClaude(signedUrl: string): Promise<{ pages: string[]; text: string }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "url", url: signedUrl } },
        { type: "text", text:
`Transcreva TODO o conteúdo textual deste documento, página por página, em português.
Regras:
- Comece cada página com uma linha exatamente assim: "=== PÁGINA N ==="
- Preserve nomes de produtos, códigos, EAN, DUN, NCM, validade, peso, quantidade por caixa, aplicações, claims e descrições exatamente como aparecem.
- Tabelas viram linhas "campo: valor".
- Não resuma, não invente, não comente. Se uma página é só imagem sem texto, escreva "(sem texto)".` },
      ],
    }],
  });
  const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
  const pages = text.split(/=== PÁGINA \d+ ===/).map((p) => p.trim()).filter(Boolean);
  return { pages, text };
}

export async function extractDocx(buf: Buffer): Promise<string> {
  const r = await mammoth.extractRawText({ buffer: buf });
  return r.value;
}

export async function extractPptx(buf: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const out: string[] = [];
  for (const name of slides) {
    const xml = await zip.files[name].async("string");
    const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
    out.push(texts.join(" ").replace(/\s+/g, " ").trim());
  }
  return out;
}

export function extractXlsx(buf: Buffer): string[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  return wb.SheetNames.map((sn) => {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sn], { header: 1, blankrows: false }) as unknown as unknown[][];
    const lines = rows.map((r) => r.map((c) => (c == null ? "" : String(c))).join(" | ").trim()).filter(Boolean);
    return `Planilha: ${sn}\n${lines.join("\n")}`;
  });
}

/** Quebra texto em pedaços de ~1500 caracteres respeitando parágrafos. */
export function chunkText(text: string, page: number | null, size = 1500, overlap = 150): Chunk[] {
  const paras = text.split(/\n{2,}|\r\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: Chunk[] = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > size && cur) {
      chunks.push({ content: cur, page });
      cur = cur.slice(-overlap) + "\n\n" + p;
    } else {
      cur = cur ? cur + "\n\n" + p : p;
    }
  }
  if (cur.trim()) chunks.push({ content: cur.trim(), page });
  return chunks;
}
