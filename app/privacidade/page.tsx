import { EMPRESA, paginaLegal } from "@/lib/legal";

export const metadata = { title: "Política de Privacidade — Brands (TGT Studio)" };

export default function Privacidade() {
  return (
    <main style={paginaLegal}>
      <h1>Política de Privacidade — Brands</h1>
      <p><i>Última atualização: {EMPRESA.atualizadoEm}</i></p>

      <h2>Quem somos</h2>
      <p>
        O Brands é uma ferramenta interna de atendimento operada por {EMPRESA.razaoSocial}, CNPJ {EMPRESA.cnpj},
        com sede em {EMPRESA.endereco}, {EMPRESA.cidade}. Contato: {EMPRESA.email}.
      </p>
      <p>
        A ferramenta é usada pela equipe da TGT Studio para atender, em nome de marcas clientes, as pessoas que
        comentam nos posts dessas marcas ou lhes enviam mensagens diretas no Instagram.
      </p>

      <h2>Que dados tratamos</h2>
      <p>Quando uma marca conecta sua conta profissional do Instagram ao Brands, passamos a tratar:</p>
      <ul>
        <li>Dados básicos da conta conectada: identificador e nome de usuário da conta profissional.</li>
        <li>Metadados das publicações da conta: identificador, data e contagem de comentários.</li>
        <li>Conteúdo de comentários públicos feitos nas publicações da conta.</li>
        <li>Conteúdo de mensagens diretas recebidas pela conta, e o identificador de quem enviou.</li>
        <li>Respostas redigidas e aprovadas pela equipe antes da publicação.</li>
      </ul>
      <p>
        O nome de usuário de quem comenta não é armazenado em texto: guardamos apenas um valor derivado, que
        serve para agrupar comentários do mesmo autor em uma mesma publicação e não permite recuperar o perfil.
      </p>
      <p>
        Não coletamos dados de navegação de terceiros, não usamos cookies de rastreamento publicitário e não
        acessamos nada além das contas que a própria marca autorizou.
      </p>

      <h2>Para que usamos</h2>
      <p>
        Exclusivamente para operar o atendimento: reunir num só lugar o que chega pelos canais das marcas,
        sugerir uma resposta, permitir que uma pessoa da equipe revise e aprove, e publicar a resposta aprovada
        de volta no Instagram.
      </p>
      <p><b>Nenhuma resposta é publicada automaticamente. Toda resposta passa por aprovação humana antes de ir ao ar.</b></p>

      <h2>Remoção de dados pessoais antes do armazenamento</h2>
      <p>
        Todo texto recebido passa por um processo automático de limpeza antes de ser gravado. Telefones,
        e-mails, arroba de usuários e links são substituídos por marcadores genéricos. O objetivo é que o
        histórico usado para melhorar as respostas não retenha dados de contato de quem escreveu.
      </p>

      <h2>Uso de inteligência artificial</h2>
      <p>
        O texto recebido, já limpo conforme descrito acima, é enviado a um provedor de modelo de linguagem para
        gerar a sugestão de resposta. O provedor atua como operador, trata o conteúdo apenas para produzir a
        sugestão e não o utiliza para treinar modelos.
      </p>

      <h2>Com quem compartilhamos</h2>
      <p>
        Não vendemos dados e não os compartilhamos para fins de publicidade. Há compartilhamento apenas com
        prestadores necessários à operação, na condição de operadores: provedor de hospedagem da aplicação,
        provedor de banco de dados e provedor de modelo de linguagem. E com a Meta Platforms, quando publicamos
        a resposta aprovada de volta na conta da marca.
      </p>

      <h2>Por quanto tempo guardamos</h2>
      <p>
        Conteúdo de atendimento é mantido enquanto a conta da marca estiver conectada, e por até 12 meses após a
        desconexão, para histórico de atendimento. Tokens de acesso são apagados imediatamente na desconexão.
        Pedidos de exclusão são atendidos conforme a seção abaixo.
      </p>

      <h2>Base legal</h2>
      <p>
        Tratamos os dados com base no legítimo interesse de operar o atendimento solicitado pela marca titular da
        conta, e na execução do contrato entre a TGT Studio e a marca. A conexão da conta é autorizada
        expressamente por quem administra a conta profissional, pelo login do Instagram.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Nos termos da LGPD (Lei 13.709/2018), e do GDPR quando aplicável, você pode solicitar confirmação de
        tratamento, acesso, correção, anonimização, portabilidade e exclusão dos seus dados, além de revogar
        consentimento. Basta escrever para {EMPRESA.email}. Respondemos em até 15 dias.
      </p>

      <h2>Exclusão de dados</h2>
      <p>
        As instruções estão em <a href="/exclusao-de-dados">{EMPRESA.base}/exclusao-de-dados</a>.
      </p>

      <h2>Alterações</h2>
      <p>Mudanças nesta política serão publicadas nesta página, com atualização da data no topo.</p>

      <h2>Contato</h2>
      <p>{EMPRESA.email} — {EMPRESA.endereco}, {EMPRESA.cidade}.</p>
    </main>
  );
}
