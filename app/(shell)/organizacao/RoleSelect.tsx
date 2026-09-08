"use client";

type Props = {
  action: (formData: FormData) => void;
  userId: string;
  brandId: string;
  defaultRole: string;
  showBrandManager: boolean;
};

const inp: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 6, padding: 4 };

/** Select que envia o form sozinho ao trocar — precisa ser Client Component por causa do onChange. */
export function RoleSelect({ action, userId, brandId, defaultRole, showBrandManager }: Props) {
  return (
    <form action={action} style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="brand_id" value={brandId} />
      <select name="role" defaultValue={defaultRole} onChange={(e) => e.currentTarget.form?.requestSubmit()} style={inp}>
        <option value="operator">Operador</option>
        <option value="admin">Administrador</option>
        {showBrandManager && <option value="brand_manager">Gestor da marca</option>}
      </select>
    </form>
  );
}
