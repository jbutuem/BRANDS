"use client";
import { useState } from "react";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  userId: string;
  brandId: string;
  defaultRole: string;
  showBrandManager: boolean;
};

const inp: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 6, padding: 4 };

/**
 * Controlado por estado local (não por defaultValue) e com botão explícito de salvar.
 * O auto-envio ao trocar o select causava a impressão de "voltar sozinho": o navegador já
 * mostrava a opção nova, mas ao reconciliar com o valor vindo do servidor o React não
 * reaplicava o defaultValue (comportamento normal de campo não-controlado) e às vezes a
 * troca parecia não ter colado. Com estado controlado + botão, o valor exibido nunca
 * depende de um recarregamento de página.
 */
export function RoleSelect({ action, userId, brandId, defaultRole, showBrandManager }: Props) {
  const [role, setRole] = useState(defaultRole);
  const [committed, setCommitted] = useState(defaultRole); // última confirmadamente salva
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true); setSaved(false);
    const fd = new FormData();
    fd.set("user_id", userId); fd.set("brand_id", brandId); fd.set("role", role);
    await action(fd);
    setBusy(false); setSaved(true); setCommitted(role);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <select value={role} onChange={(e) => { setRole(e.target.value); setSaved(false); }} style={inp}>
        <option value="operator">Operador</option>
        <option value="admin">Administrador</option>
        {showBrandManager && <option value="brand_manager">Gestor da marca</option>}
      </select>
      <button type="button" onClick={save} disabled={busy || role === committed}
        style={{ background: saved ? "#1b7f4b" : "transparent", color: saved ? "#fff" : "var(--ink)", border: "1px solid var(--line)", borderRadius: 6, padding: "4px 10px", cursor: busy || role === committed ? "default" : "pointer", fontSize: 13 }}>
        {busy ? "Salvando…" : saved ? "Salvo ✓" : "Salvar"}
      </button>
    </div>
  );
}
