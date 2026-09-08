import { getSession } from "@/lib/brand";
import { Fila } from "./Fila";

export const dynamic = "force-dynamic";

export default async function FilaPage() {
  const { active } = await getSession();
  return (
    <div key={active!.id}>
      <h2>Fila de respostas</h2>
      <p className="lede">Cole várias mensagens de uma vez, gere todas juntas e aprove em lote. Nada é enviado automaticamente — aprovar copia o texto para você colar no Meta.</p>
      <Fila brandName={active!.name} />
    </div>
  );
}
