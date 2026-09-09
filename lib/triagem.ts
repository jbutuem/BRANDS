/**
 * Triagem do que a varredura encontra.
 *
 * A checagem mecânica de autoria não basta: a API do Instagram omite o autor em
 * parte dos comentários, e as respostas da própria marca caem justamente nesse
 * grupo. Aqui entra a leitura de bom senso — sinais de que o texto É a marca
 * falando, e não alguém falando com ela.
 *
 * A triagem NÃO decide sozinha. Ela marca, a Fila avisa, e o operador resolve.
 * Descartar em silêncio esconde erro; avisar deixa o erro visível e corrigível.
 */

export type Triagem = { tipo: "suspeita_marca" | "so_reacao" | null; motivo: string | null };

/**
 * Frases que uma marca usa para responder e um cliente não usa para perguntar.
 * Note a assimetria: "onde comprar?" é cliente; "para saber onde comprar,
 * consulte o link da bio" é marca.
 */
const FRASES_DE_MARCA = [
  /link (d[aoe] )?bio/i,
  /nossos? (produtos?|parceiros?|revendedores?|distribuidores?)/i,
  /nossa (loja|equipe|central|linha)/i,
  /consulte (o|nosso)/i,
  /estamos (à|a) disposição/i,
  /obrigad[oa] pelo (contato|carinho|feedback)/i,
  /agradecemos o (contato|carinho)/i,
  /qualquer d[úu]vida,? (estamos|conte|fale)/i,
  /entre em contato (com|pelo)/i,
  /encaminhamos (seu|sua)/i,
  /nosso (sac|atendimento|time|whatsapp)/i,
  /segue (o|nosso) link/i,
];

/** Emojis e pontuação: se sobrar quase nada, é reação, não pergunta. */
const RE_EMOJI = /[\p{Extended_Pictographic}\u200d\uFE0F\u{1F3FB}-\u{1F3FF}]/gu;
const ELOGIO_CURTO = /^(top|show|lindo|linda|perfeito|maravilhos[oa]|delicia|delícia|amei|adorei|nossa|uau|bom demais|muito bom|que legal|parab[ée]ns|sensacional|incr[íi]vel)[!.\s]*$/i;

/** Texto sem emoji, sem pontuação e sem espaço — o que sobra de conteúdo real. */
function miolo(texto: string): string {
  return texto.replace(RE_EMOJI, "").replace(/[^\p{L}\p{N}]/gu, "").trim();
}

export function ehSoReacao(texto: string): boolean {
  const t = texto.trim();
  if (!t) return false;
  const restante = miolo(t);
  // Só emoji, ou emoji com um elogio curtinho e nenhuma pergunta.
  if (!restante) return true;
  if (/[?？]/.test(t)) return false;
  return restante.length <= 22 && ELOGIO_CURTO.test(t.replace(RE_EMOJI, "").trim());
}

/**
 * @param texto            já passado pelo Scrubber (arroba vira [perfil])
 * @param autorConhecido   a API disse de quem é o comentário?
 * @param ehResposta       o comentário é resposta a outro (tem parent_id)?
 */
export function triar(texto: string, autorConhecido: boolean, ehResposta = false): Triagem {
  const t = texto.trim();

  const sinais: string[] = [];
  if (FRASES_DE_MARCA.some((re) => re.test(t))) sinais.push("usa linguagem de marca respondendo");
  // Resposta da marca quase sempre começa mencionando quem perguntou.
  if (/^\[perfil\]/.test(t)) sinais.push("começa mencionando outro perfil");
  if (ehResposta) sinais.push("é resposta dentro de uma thread");
  if (!autorConhecido) sinais.push("a API não informou o autor");

  // Autor conhecido derruba a suspeita: se sabemos que é de terceiro, é de terceiro.
  // Sem autor, basta um sinal de linguagem para levantar a bandeira.
  const suspeito = !autorConhecido && sinais.length >= 2;
  if (suspeito) return { tipo: "suspeita_marca", motivo: sinais.join("; ") };

  if (ehSoReacao(t)) {
    return { tipo: "so_reacao", motivo: "elogio ou emoji, sem pergunta — reagir costuma bastar" };
  }
  return { tipo: null, motivo: null };
}
