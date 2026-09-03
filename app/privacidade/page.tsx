export const metadata = { title: "Política de Privacidade — Listening (TGT Studio)" };

export default function Privacidade() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px", lineHeight: 1.6 }}>
      <h1>Política de Privacidade — Listening</h1>
      <p><b>Última atualização:</b> 3 de setembro de 2026 · <b>Responsável:</b> TGT Studio (contato@tgtstudio.com.br)</p>

      <h2>1. O que é o Listening</h2>
      <p>O Listening é uma plataforma da TGT Studio que ajuda equipes de atendimento de marcas a responder mensagens recebidas em redes sociais (Instagram, Facebook, WhatsApp e TikTok). A plataforma sugere respostas com apoio de inteligência artificial; um operador humano da marca revisa e decide o envio, salvo em categorias de baixo risco que a marca opte por automatizar, sempre com identificação de que se trata de atendimento automatizado.</p>

      <h2>2. Papéis (LGPD)</h2>
      <p>As marcas que usam o Listening são as <b>controladoras</b> dos dados de seus clientes. A TGT Studio atua como <b>operadora</b>, tratando dados exclusivamente conforme instruções de cada marca e nos termos do contrato de prestação de serviço, que inclui cláusula específica de tratamento de dados pessoais.</p>

      <h2>3. Quais dados são tratados</h2>
      <ul>
        <li><b>Conteúdo das mensagens</b> enviadas pelo usuário à marca. Antes de qualquer armazenamento, o texto passa por um processo automático de anonimização que remove nomes, telefones, e-mails, nomes de perfil e links. O texto original existe apenas em memória durante o processamento e não é gravado.</li>
        <li><b>Identificadores técnicos</b> fornecidos pelas plataformas (por exemplo, o ID de conversa da Meta) apenas pelo tempo necessário para entregar a resposta na mesma conversa.</li>
        <li><b>Dados dos operadores</b> das marcas: e-mail e registro de quais respostas foram aprovadas.</li>
      </ul>
      <p>O Listening <b>não</b> armazena nome, foto, telefone ou nome de usuário dos clientes das marcas, e não constrói perfis de pessoas.</p>

      <h2>4. Para que os dados são usados</h2>
      <ul>
        <li>Gerar e enviar respostas às mensagens recebidas pela marca.</li>
        <li>Permitir que a marca acompanhe seus próprios atendimentos.</li>
        <li>Produzir estatísticas agregadas e anonimizadas (volume por assunto, região e horário) para a própria marca.</li>
      </ul>
      <p>Os dados de uma marca nunca são usados para outra marca nem para treinar modelos de inteligência artificial.</p>

      <h2>5. Compartilhamento</h2>
      <p>Para gerar sugestões de resposta, o texto já anonimizado é processado por provedores de inteligência artificial (Anthropic), sob contrato que veda o uso dos dados para treinamento. A infraestrutura é hospedada em Supabase e Vercel. Não há venda nem compartilhamento de dados com terceiros para fins de marketing.</p>

      <h2>6. Retenção</h2>
      <p>Mensagens anonimizadas e respostas são mantidas pelo período definido em contrato com cada marca (padrão: 12 meses) e depois excluídas. Identificadores técnicos das plataformas são descartados ao término de cada atendimento.</p>

      <h2>7. Direitos do titular</h2>
      <p>Você pode solicitar confirmação de tratamento, acesso, correção ou eliminação de dados diretamente à marca com quem conversou, ou pelo e-mail contato@tgtstudio.com.br. Como o conteúdo é anonimizado antes do armazenamento, na maioria dos casos não é possível vincular registros a uma pessoa específica; ainda assim, atenderemos toda solicitação na medida do tecnicamente viável.</p>

      <h2>8. Dados de plataformas Meta e TikTok</h2>
      <p>O uso de dados obtidos por meio das APIs da Meta (Instagram, Facebook, WhatsApp) e do TikTok segue os termos e políticas dessas plataformas. Ao desconectar uma conta, os dados associados àquele canal são eliminados em até 30 dias. Para solicitar a exclusão de dados vinculados a uma conta Meta, escreva para contato@tgtstudio.com.br com o assunto "Exclusão de dados".</p>

      <h2>9. Segurança</h2>
      <p>Acesso por login individual, isolamento de dados por marca no banco de dados, comunicação criptografada (TLS) e segredos de integração armazenados em cofre. Registros de auditoria de quem aprovou cada resposta.</p>

      <h2>10. Contato</h2>
      <p>TGT Studio — contato@tgtstudio.com.br</p>
    </main>
  );
}
