"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDocument, reprocessDocument } from "./actions";

type Doc = { id: string; name: string; file_type: string; status: string; pages: number | null; chunk_count: number; error: string | null };

export function DocRow({ doc, canEdit }: { doc: Doc; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const label = doc.status === "ready" ? "pronto" : doc.status === "error" ? "erro" : "processando";
  async function reprocess() {
    await reprocessDocument(doc.id);
    await fetch("/api/ingest", { method: "POST", body: JSON.stringify({ documentId: doc.id }) });
    router.refresh();
  }
  return (
    <tr style={{ borderTop: "1px solid var(--line)" }}>
      <td style={{ padding: "8px 0" }}>{doc.name}{doc.error && <div className="error">{doc.error}</div>}</td>
      <td>{label}</td>
      <td>{doc.pages ?? "—"}</td>
      <td>{doc.chunk_count}</td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {canEdit && (
          <>
            <button disabled={pending} onClick={() => start(reprocess)} style={{ background: "none", border: "none", textDecoration: "underline", cursor: "pointer" }}>reprocessar</button>
            {" · "}
            <button disabled={pending} onClick={() => confirm(`Remover "${doc.name}"?`) && start(() => deleteDocument(doc.id))} style={{ background: "none", border: "none", textDecoration: "underline", cursor: "pointer", color: "#b3261e" }}>remover</button>
          </>
        )}
      </td>
    </tr>
  );
}
