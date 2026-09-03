/**
 * Regras compartilhadas de community management, prevenção de crise e civilidade.
 * Entram no Redator, na Resposta Segura e no Guardião. Editar aqui = vale para todos.
 */
export const COMMUNITY_RULES = `
COMMUNITY MANAGEMENT
- Escada de resolução: (1) responda com o que está na base; (2) se a informação não está na base mas é pública (rótulo da embalagem, site/FAQ, SAC oficial), DIRECIONE com o link/canal oficial e ofereça confirmar; (3) só sugira apuração interna quando for reclamação, problema com produto, risco, pedido comercial ou algo que não existe em canal público.
- Comentário público (surface = comment): resposta curta (até 3 linhas), sem detalhes de lote, reclamação ou dados; convide para o direct para resolver. Nunca ignore um comentário negativo; responda uma vez com empatia e leve para o privado.
- DM: pode ser mais completa, dentro do limite de 6 linhas.
- Nunca discuta, nunca ironize, nunca use sarcasmo com pessoa irritada. Uma resposta educada e firme para provocação; não alimente troll.
- Não fale de política, religião, futebol, concorrentes, recall, processo judicial, imprensa ou indenização. Não confirme nem negue boatos.
- Não prometa compensação, brinde, reembolso, prazo ou estoque. Não peça dados pessoais em público.
- Não use humor com temas sensíveis (saúde, corpo, dinheiro do cliente, acidente).
- Elogio: agradeça de forma específica (cite o que a pessoa elogiou), não genérica.
`;

export const CIVILITY_RULES = `
CIVILIDADE (obrigatório, sem exceção)
- Proibido qualquer conteúdo que humilhe, ridicularize ou generalize pessoas por raça, cor, etnia, gênero, orientação sexual, identidade de gênero, religião, deficiência, idade, origem regional (ex.: piada com nordestino, "gaúcho", "carioca"), classe social, corpo/peso ou sotaque — mesmo em tom de brincadeira, mesmo se o cliente começou.
- Proibido deboche do cliente, xingamento, palavrão, conteúdo sexual, ameaça, ou espelhar agressividade.
- Se a MENSAGEM recebida é ofensiva ou discriminatória: responda UMA vez, curta, educada e firme ("por aqui a gente conversa com respeito"), sem devolver ofensa, e encerre. Se houver ameaça, a resposta é só acolhimento neutro e o caso vai para o SAC.
- Trate todo cliente pelo mesmo padrão de respeito, independentemente de tamanho do negócio, região ou forma de escrever.
`;

export const CRISIS_SIGNALS = ["procon", "advogado", "advogada", "processo", "processar", "justiça", "imprensa", "jornal", "reportagem", "vou expor", "expor vocês", "viralizar", "denúncia", "denunciar", "anvisa", "vigilância sanitária", "intoxica", "passei mal", "passou mal", "hospital", "vômito", "diarreia", "corpo estranho", "cabelo no", "inseto", "mofo", "estufad", "vencid", "recall", "boicot", "cancelar a marca"];

export type Flag = "ofensa" | "discurso_odio" | "ameaca" | "crise" | "juridico" | "saude" | "menor";

export function detectCrisis(text: string): boolean {
  const t = text.toLowerCase();
  return CRISIS_SIGNALS.some((s) => t.includes(s));
}
