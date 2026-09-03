"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  md: "text/markdown",
};

export function Uploader({ brandId, brandSlug }: { brandId: string; brandSlug: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ step: string; error?: string } | null>(null);

  async function send() {
    const file = input.current?.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!TYPES[ext]) { setState({ step: "", error: `Formato .${ext} não aceito. Use PDF, DOCX, PPTX, XLSX, TXT ou MD.` }); return; }
    const sb = supabaseBrowser();
    const id = crypto.randomUUID();
    const path = `${id}.${ext}`;

    setState({ step: `Enviando ${file.name}…` });
    const up = await sb.storage.from(`brand-${brandSlug}`).upload(path, file, { contentType: TYPES[ext], upsert: false });
    if (up.error) { setState({ step: "", error: `Falha no envio: ${up.error.message}` }); return; }

    const ins = await sb.from("documents").insert({ id, brand_id: brandId, name: file.name, file_type: ext, storage_path: path, status: "processing" });
    if (ins.error) { setState({ step: "", error: `Falha ao registrar: ${ins.error.message}` }); return; }

    setState({ step: ext === "pdf" ? "Lendo o PDF página por página (pode levar alguns minutos)…" : "Extraindo texto…" });
    router.refresh();
    const r = await fetch("/api/ingest", { method: "POST", body: JSON.stringify({ documentId: id }) });
    const j = await r.json();
    if (!r.ok) setState({ step: "", error: j.error ?? "Falha no processamento" });
    else setState({ step: `Pronto: ${j.chunks} trechos${j.pages ? ` em ${j.pages} páginas` : ""}.` });
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input ref={input} type="file" accept=".pdf,.docx,.pptx,.xlsx,.txt,.md" />
        <button className="btn" onClick={send} disabled={!!state?.step && !state.step.startsWith("Pronto")}>Enviar e processar</button>
      </div>
      {state?.step && <p className="muted" style={{ marginTop: 10 }}>{state.step}</p>}
      {state?.error && <p className="error" style={{ marginTop: 10 }}>{state.error}</p>}
    </div>
  );
}
