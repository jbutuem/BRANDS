import { getSession } from "@/lib/brand";
import { Fila } from "./Fila";

export const dynamic = "force-dynamic";

export default async function FilaPage() {
  const { active } = await getSession();
  return (
    <div key={active!.id}>
      <h2>Fila de respostas</h2>
      <p className="lede">
        Comentários e DMs dos canais conectados caem aqui sozinhos. Você também pode colar mensagens à mão,
        várias de uma vez. Nada sai sem alguém liberar: em canal conectado, aprovar publica no Instagram;
        no resto, aprovar copia o texto para você colar.
      </p>
      <Fila brandName={active!.name} />
    </div>
  );
}
