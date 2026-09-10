"use client";
import { useState } from "react";
import { decidirCandidata } from "./actions";

export type Candidata = {
  id: string; question: string; answer: string; intent: string | null;
  operator_hint: string | null; created_at: string;
};

/**
 * Curadoria das respostas aprovadas.
 *
 * Resposta que o operador publicou vira candidata, não exemplo. Exemplo entra no
 * prompt de TODAS as respostas seguintes da marca — um exemplo ruim contamina
 * tudo. Por isso a promoção é decidida por uma pessoa, aqui.
 */
export function Golden({ candidatas, canEdit }: { candidatas: Candidata[]; canEdit: boolean }) {
  const [lista, setLista] = useState(candidatas);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function decidir(id: string, aprovar: boolean) {
    setOcupado(id);
    await decidirCandidata(id, aprovar);
    setLista((prev) => prev.filter((c) => c.id !== id));
    setOcupado(null);
  }

  if (!lista.length) {
    return (
      <div className="panel">
        <h3>Respostas de referência</h3>
        <p className="muted">
          Nenhuma candidata no momento. Toda resposta que um operador publica entra aqui para
          você decidir se vira exemplo de referência da marca.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3>Respostas de referência ({lista.length} para revisar)</h3>
      <p className="lede" style={{ marginBottom: 12 }}>
        Estas foram publicadas pelos operadores. As que você aprovar viram exemplo de tom e
        conteúdo para todas as próximas respostas da marca — aprove só o que representa bem.
      </p>
      <div style={{ display: "grid", gap: 12 }}>
        {lista.map((c) => (
          <div key={c.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <div className="muted" style={{ fontSize: 13 }}>
              cliente: &quot;{c.question}&quot;
              {c.intent && <> · {c.intent}</>}
            </div>
            {c.operator_hint && (
              <div className="muted" style={{ fontSize: 12, fontStyle: "italic", marginTop: 2 }}>
                com instrução: “{c.operator_hint}”
              </div>
            )}
            <div style={{ whiteSpace: "pre-wrap", fontSize: 14, margin: "6px 0 10px" }}>{c.answer}</div>
            {canEdit ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn" disabled={ocupado === c.id} onClick={() => decidir(c.id, true)}>
                  Usar como referência
                </button>
                <button disabled={ocupado === c.id} onClick={() => decidir(c.id, false)} style={btn()}>
                  Não usar
                </button>
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>Só admin ou gestor da marca decide.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function btn(): React.CSSProperties {
  return { background: "transparent", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 6, padding: "8px 12px", cursor: "pointer", fontSize: 13 };
}
