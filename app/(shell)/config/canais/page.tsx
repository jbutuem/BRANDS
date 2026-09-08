import { getSession } from "@/lib/brand";
import { disconnect } from "./actions";

export const dynamic = "force-dynamic";

type Conn = {
  id: string; provider: string; external_id: string; display_name: string | null; status: string | null;
  mode: string | null; subscribed_at: string | null; last_event_at: string | null; last_error: string | null;
};

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

export default async function CanaisPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { sb, active } = await getSession();
  const { data } = await sb
    .from("channel_connections")
    .select("id, provider, external_id, display_name, status, mode, subscribed_at, last_event_at, last_error")
    .eq("brand_id", active!.id)
    .order("provider");
  const conns = (data ?? []) as Conn[];

  return (
    <div>
      <h2>Canais</h2>
      <p className="lede">
        Conecte a página do Facebook e o Instagram business de {active!.name}. Comentários e DMs passam a cair
        na Fila sozinhos. A resposta continua sendo gerada e liberada por uma pessoa — nada é publicado automaticamente.
      </p>

      {sp.ok && <p className="ok">✓ {sp.ok}</p>}
      {sp.erro && <p className="erro">✗ {sp.erro}</p>}

      <p>
        <a className="btn" href="/api/meta/oauth/start">Conectar conta Meta</a>
      </p>

      {!conns.length ? (
        <p className="lede">Nenhum canal conectado ainda.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Canal</th><th>Conta</th><th>Status</th><th>Webhook</th><th>Último evento</th><th /></tr>
          </thead>
          <tbody>
            {conns.map((c) => (
              <tr key={c.id}>
                <td>{c.provider === "instagram" ? "Instagram" : "Facebook"}</td>
                <td>{c.display_name ?? c.external_id}<br /><small>{c.external_id}</small></td>
                <td>{c.status ?? "—"}{c.last_error ? <><br /><small className="erro">{c.last_error}</small></> : null}</td>
                <td>{c.subscribed_at ? "assinado" : "não assinado"}</td>
                <td>{fmt(c.last_event_at)}</td>
                <td>
                  <form action={disconnect}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit">Desconectar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>O que a conexão permite</h3>
      <ul>
        <li>Ler comentários e menções nos posts da conta e mensagens diretas recebidas.</li>
        <li>Publicar a resposta que o operador liberou, no mesmo comentário ou na mesma conversa.</li>
        <li>Todo texto recebido passa pelo Scrubber antes de ser gravado — telefone, e-mail, @ e link viram marcador.</li>
      </ul>
    </div>
  );
}
