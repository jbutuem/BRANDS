import { EMPRESA, paginaLegal } from "@/lib/legal";

export const metadata = { title: "Termos de Serviço — Brands (TGT Studio)" };

export default function Termos() {
  return (
    <main style={paginaLegal}>
      <h1>Termos de Serviço — Brands</h1>
      <p><i>Última atualização: {EMPRESA.atualizadoEm}</i></p>

      <h2>O que é o Brands</h2>
      <p>
        O Brands é uma ferramenta interna operada por {EMPRESA.razaoSocial} para o atendimento das contas de
        redes sociais de marcas clientes. O acesso é restrito à equipe autorizada da TGT Studio e às marcas
        clientes contratantes. Não é um serviço aberto ao público nem disponível para cadastro.
      </p>

      <h2>Uso permitido</h2>
      <p>
        O acesso é pessoal e intransferível. É vedado compartilhar credenciais, tentar acessar dados de marcas
        às quais o usuário não foi designado, ou usar a ferramenta para qualquer finalidade que não o
        atendimento contratado.
      </p>

      <h2>Conexão de contas do Instagram</h2>
      <p>
        A conexão de uma conta profissional do Instagram só pode ser feita por quem tem autorização para
        administrá-la. Ao conectar, a marca autoriza a TGT Studio a ler comentários e mensagens recebidas e a
        publicar respostas aprovadas em seu nome. A conexão pode ser desfeita a qualquer momento, pela própria
        ferramenta ou pelas configurações do Instagram.
      </p>

      <h2>Respostas e responsabilidade editorial</h2>
      <p>
        As sugestões de resposta são geradas automaticamente e podem conter erros. Nenhuma é publicada sem
        aprovação de uma pessoa da equipe, e a responsabilidade editorial pelo que é publicado é de quem aprova.
      </p>

      <h2>Disponibilidade</h2>
      <p>
        A ferramenta é fornecida no estado em que se encontra. Não garantimos disponibilidade ininterrupta, e
        dependemos de serviços de terceiros, incluindo as APIs da Meta, cuja indisponibilidade pode interromper
        o funcionamento.
      </p>

      <h2>Encerramento</h2>
      <p>
        O acesso pode ser encerrado a qualquer momento pela TGT Studio, e a marca cliente pode solicitar a
        desconexão de suas contas e a exclusão de seus dados a qualquer momento.
      </p>

      <h2>Legislação e foro</h2>
      <p>Estes termos são regidos pela legislação brasileira, com foro na comarca de Campinas, São Paulo.</p>

      <h2>Contato</h2>
      <p>{EMPRESA.email}</p>
    </main>
  );
}
