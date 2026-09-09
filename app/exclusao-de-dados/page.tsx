import { EMPRESA, paginaLegal } from "@/lib/legal";

export const metadata = { title: "Exclusão de Dados — Brands (TGT Studio)" };

export default function ExclusaoDeDados() {
  return (
    <main style={paginaLegal}>
      <h1>Exclusão de Dados — Brands</h1>
      <p><i>Última atualização: {EMPRESA.atualizadoEm}</i></p>

      <h2>Como pedir a exclusão</h2>
      <p>
        Envie um e-mail para {EMPRESA.email} com o assunto &quot;Exclusão de dados — Brands&quot;, informando o
        nome de usuário do Instagram envolvido e, se souber, a marca com quem a conversa aconteceu. Não é
        preciso justificar o pedido.
      </p>
      <p>
        Confirmamos o recebimento em até 5 dias úteis e concluímos a exclusão em até 15 dias, contados do
        recebimento.
      </p>

      <h2>O que é excluído</h2>
      <p>
        Todo o conteúdo associado ao usuário indicado: comentários e mensagens armazenados, respostas
        relacionadas e quaisquer registros de atendimento vinculados. A exclusão é definitiva e não é reversível.
      </p>

      <h2>Desconexão de uma conta de marca</h2>
      <p>
        Quem administra uma conta profissional conectada pode desfazer a conexão a qualquer momento, pela tela de
        Canais do Brands ou pelo Instagram, em Configurações, Apps e sites. Ao desconectar, o token de acesso é
        apagado imediatamente e a ferramenta deixa de receber qualquer conteúdo novo daquela conta.
      </p>
      <p>Para apagar também o histórico já armazenado daquela marca, envie o pedido pelo e-mail acima.</p>

      <h2>Contato</h2>
      <p>{EMPRESA.email} — {EMPRESA.razaoSocial}, {EMPRESA.endereco}, {EMPRESA.cidade}.</p>
    </main>
  );
}
