import Anthropic from "@anthropic-ai/sdk";
import { COMMUNITY_RULES, CIVILITY_RULES, MODERATION_RULES, type Flag } from "./policy";

const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export const MODEL_FAST = process.env.CLAUDE_MODEL_FAST ?? "claude-haiku-4-5-20251001";
export const MODEL_MAIN = process.env.CLAUDE_MODEL ?? "claude-sonnet-5";

export type Intent = "produto" | "onde_comprar" | "tecnica" | "engajamento" | "reclamacao" | "risco" | "outro";
export type Classification = {
  intent: Intent; products: string[]; uf: string | null; city: string | null;
  sentiment: "positivo" | "neutro" | "negativo"; personal_names: string[]; summary: string; flags?: Flag[];
};
export type BrandVoice = { name: string; persona: string; dos: string[]; donts: string[]; safety: string[]; signature: string | null; links: Record<string, string>; facts: string[] };
export type Verdict = { verdict: "aprovada" | "reescrita" | "redirecionar" | "escalar" | "bloqueada" | "moderacao"; reason: string; escalate_to?: "comercial" | "tecnico" | "sac" | null; rewrite_hint?: string };

/** Extrai e repara JSON vindo do modelo: pega o primeiro {...}, escapa quebras de linha dentro de strings. */
function parseJsonLoose<T>(text: string): T {
  let t = text.replace(/```json|```/g, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try { return JSON.parse(t) as T; } catch { /* tenta reparar */ }
  let out = "", inStr = false, esc = false;
  for (const ch of t) {
    if (esc) { out += ch; esc = false; continue; }
    if (ch === "\\") { out += ch; esc = true; continue; }
    if (ch === '"') { inStr = !inStr; out += ch; continue; }
    if (inStr && (ch === "\n" || ch === "\r")) { out += "\\n"; continue; }
    if (inStr && ch === "\t") { out += "\\t"; continue; }
    out += ch;
  }
  return JSON.parse(out) as T;
}

async function json<T>(model: string, system: string, user: string, max = 1200): Promise<T> {
  const r = await client().messages.create({ model, max_tokens: max, system, messages: [{ role: "user", content: user }] });
  const text = r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  try { return parseJsonLoose<T>(text); } catch { /* segunda tentativa: pede só o JSON */ }
  const r2 = await client().messages.create({ model, max_tokens: max, system, messages: [
    { role: "user", content: user }, { role: "assistant", content: text },
    { role: "user", content: "Sua resposta não é JSON válido. Repita SOMENTE o objeto JSON, em uma única linha, sem quebras de linha dentro dos textos, sem comentários." },
  ] });
  const text2 = r2.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  return parseJsonLoose<T>(text2);
}

/** 1. Classificador (rápido). Também devolve nomes próprios para o Scrubber. */
export function classify(brand: string, text: string) {
  return json<Classification>(MODEL_FAST,
`Você classifica mensagens recebidas nas redes sociais da marca ${brand} (food service, Brasil). Responda SOMENTE com JSON válido, sem comentários:
{"intent":"produto|onde_comprar|tecnica|engajamento|reclamacao|risco|outro","products":["nomes de produtos citados"],"uf":"UF em 2 letras ou null","city":"cidade ou null","sentiment":"positivo|neutro|negativo","personal_names":["nomes de PESSOAS citados no texto, nunca marcas ou produtos"],"summary":"o que a pessoa quer, em uma frase","flags":["zero ou mais de: ofensa, discurso_odio, sexismo, ameaca, crise, juridico, saude, menor"]}
Regras: "risco" = saúde, alergia grave, intoxicação, menor de idade, ameaça, pedido de dado pessoal. "reclamacao" = produto com defeito, atraso, atendimento ruim. "tecnica" = como usar, rendimento, conservação, tabela nutricional, alérgenos.
Flags: "ofensa" = xingamento/deboche dirigido à marca ou equipe; "discurso_odio" = preconceito ou ataque a grupo (raça, cor, etnia, orientação sexual, identidade de gênero, religião, deficiência, origem regional, corpo); "sexismo" = machismo, objetificação ou sexualização de mulheres, insinuação sexual, comparação de pessoas a objetos/produtos (ex.: "melhor que pegar uma rapariga", "gostosa"), piada de cunho sexual — mesmo em tom de brincadeira; quando houver qualquer uma dessas, a intenção NÃO é engajamento; "ameaca" = ameaça a pessoas ou à marca; "crise" = menção a Procon, advogado, processo, imprensa, expor/viralizar, Anvisa, intoxicação, mal-estar, corpo estranho, produto vencido/estufado, recall, boicote; "juridico" = pedido de indenização/compensação; "saude" = pergunta de segurança alimentar/alergia/gestante/criança; "menor" = indícios de menor de idade.`,
    text);
}

/** 3. Redator — escreve como a marca. */
export async function write(voice: BrandVoice, cls: Classification, message: string, context: string, examples: string, hint?: string, extra?: { firstName: string | null; history: string; surface?: "dm" | "comment" }) {
  const r = await client().messages.create({
    model: MODEL_MAIN, max_tokens: 700,
    system: `Você responde, em nome da marca ${voice.name}, mensagens de clientes e leads nas redes sociais (Instagram/Facebook/WhatsApp), em português do Brasil.

PERSONA: ${voice.persona || `${voice.name} fala como uma pessoa da equipe: próxima, direta, entusiasmada com comida e com o negócio do cliente. Trata o cliente como parceiro de food service.`}
FAÇA: ${voice.dos.length ? voice.dos.join("; ") : "seja específico; use o nome do produto; sugira uma aplicação, dica ou receita quando fizer sentido; faça uma pergunta de continuidade quando faltar informação (ex.: cidade)"}
NÃO FAÇA: ${voice.donts.length ? voice.donts.join("; ") : "não use tom corporativo nem jargão; não comece com 'Olá! Agradecemos o contato'; não use emojis em excesso (máx. 1); não invente dados"}
${voice.signature ? `ASSINATURA: termine com "${voice.signature}"` : ""}

FATOS DA MARCA (sempre verdadeiros, valem para toda a linha):
${voice.facts.length ? voice.facts.map((f) => "- " + f).join("\n") : "(nenhum cadastrado)"}

REGRAS DURAS:
- Se a pergunta é coberta por um FATO DA MARCA, responda com segurança e de forma direta. Nunca use "depende", "eventual", "pode ser que" ou mande olhar o rótulo para algo que está nos fatos. Ex.: "tem álcool?" → "Não, nenhum produto nosso tem álcool" (se o fato disser isso).
- Só afirme código, validade, peso, EAN, rendimento, ingredientes e alérgenos que estejam no CONTEXTO abaixo. Se não estiver, diga que vai confirmar.
- Use SOMENTE nomes de produto que existam no CONTEXTO. Se o cliente escreveu o nome errado ou abreviado (ex.: "griu", "maionese grio"), use o nome correto da base naturalmente, sem corrigir a pessoa e sem repetir o nome errado. Se nenhum produto da base corresponder, diga que não identificou o produto e pergunte qual é.
- NUNCA garanta que um produto "não faz mal", "é seguro", "pode consumir" ou dê qualquer garantia de saúde, mesmo em tom leve. Para perguntas de segurança alimentar, alergia, gestante, criança ou mal-estar: acolha, informe só o que está no rótulo/contexto (validade, conservação, ingredientes) e direcione ao SAC. Se houver relato de problema com o produto, peça lote e validade e encaminhe.
- Nunca dê orientação médica ou nutricional individual; nunca prometa preço, prazo de entrega ou disponibilidade.
- Se a pessoa não disse a cidade/UF e a dúvida é onde comprar, pergunte a cidade de forma natural.
- Se a mensagem é reclamação, acolha, não se justifique, e direcione para o canal certo.
- Não repita a pergunta da pessoa. Máximo 6 linhas. Sem títulos, sem listas com marcadores.
- Não mencione que existe um "contexto" nem que você é uma IA.
- SUPERFÍCIE: ${extra?.surface === "comment" ? "COMENTÁRIO PÚBLICO — até 3 linhas, sem dados, sem detalhes de reclamação; convide para o direct quando precisar aprofundar." : "MENSAGEM DIRETA (privada)."}
${COMMUNITY_RULES}
${CIVILITY_RULES}
${extra?.firstName ? `- A pessoa se chama ${extra.firstName}: use o primeiro nome UMA vez, de forma natural (não em toda frase).` : "- Você não sabe o nome da pessoa: não invente nem use apelidos."}
${extra?.history ? "- Esta é a CONTINUAÇÃO de um atendimento. Não se apresente de novo, não repita o que já foi dito e responda ao que a pessoa acabou de dizer, usando o que ela já informou antes." : ""}`,
    messages: [{ role: "user", content:
`${extra?.history ? `HISTÓRICO DO ATENDIMENTO:\n${extra.history}\n\n` : ""}NOVA MENSAGEM DO CLIENTE (já anonimizada):
${message}

CLASSIFICAÇÃO: ${JSON.stringify(cls)}

CONTEXTO DA MARCA (única fonte de fatos):
${context || "(nada encontrado na base)"}

${examples ? `EXEMPLOS DE RESPOSTAS APROVADAS DA MARCA (imite o tom, não copie):\n${examples}\n` : ""}${hint ? `AJUSTE PEDIDO PELO REVISOR: ${hint}\n` : ""}
Escreva só a resposta final.` }],
  });
  return r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
}

/** 3b. Resposta segura — usada quando o Guardião decide redirecionar/escalar/bloquear: acolhe e direciona, sem afirmar nada de risco. */
export async function safeReply(voice: BrandVoice, cls: Classification, message: string, reason: string, escalateTo: string | null, context: string, extra?: { firstName: string | null; history: string; surface?: "dm" | "comment"; mode?: "escalar" | "redirecionar" | "bloqueada" }) {
  const r = await client().messages.create({
    model: MODEL_MAIN, max_tokens: 400,
    system: `Você responde em nome da marca ${voice.name}, em português do Brasil. PERSONA: ${voice.persona || "próxima, direta, parceira do food service"}.
Esta mensagem foi marcada pelo revisor como "${extra?.mode === "redirecionar" ? "direcionar para canal oficial" : escalateTo ? "encaminhar para " + escalateTo : "bloqueada"}" pelo motivo: ${reason}.
${extra?.mode === "redirecionar"
  ? `Escreva uma resposta curta (até 4 linhas) que: acolhe a pessoa; NÃO afirma nada sobre composição, segurança, saúde, preço, prazo ou estoque; aponta o CANAL OFICIAL onde a informação está (rótulo da embalagem, ficha do produto no site/FAQ, SAC) usando os LINKS OFICIAIS abaixo; e se oferece para confirmar por aqui se a pessoa preferir. Sem inventar link.`
  : `Escreva uma resposta curta (até 4 linhas) que: acolhe a pessoa; NÃO afirma nada sobre segurança, saúde, alergia, composição, preço, prazo ou estoque; NÃO promete resultado; diz que vai passar para ${escalateTo === "sac" ? "o atendimento ao consumidor" : escalateTo === "tecnico" ? "o time técnico" : escalateTo === "comercial" ? "o time comercial" : "a equipe responsável"} e que retorna aqui.`}
${(cls.flags ?? []).includes("ofensa") || (cls.flags ?? []).includes("discurso_odio") ? "A mensagem recebida é ofensiva: responda UMA vez, curta e firme, sem devolver ofensa (ex.: 'Por aqui a gente conversa com respeito. Se quiser resolver, estou à disposição.')." : ""}
${(cls.flags ?? []).includes("ameaca") || (cls.flags ?? []).includes("crise") ? "Situação sensível: tom sóbrio, sem emoji, sem humor; acolha, não se justifique, não confirme nem negue nada, e diga que a equipe responsável vai entrar em contato por aqui." : ""}
SUPERFÍCIE: ${extra?.surface === "comment" ? "comentário público — até 2 linhas e convite para o direct." : "mensagem direta."}
${CIVILITY_RULES}
FATOS DA MARCA (pode afirmar com segurança): ${voice.facts.length ? voice.facts.join(" | ") : "nenhum"}
LINKS OFICIAIS: ${voice.links && Object.keys(voice.links).length ? Object.entries(voice.links).map(([k, v]) => `${k}: ${v}`).join(" · ") : "(nenhum cadastrado — não cite link)"}
Peça informação adicional SÓ quando ela for necessária para o encaminhamento: lote e validade apenas se a pessoa relatou problema com o produto (gosto estranho, embalagem, mal-estar); cidade e tipo de negócio apenas em pedido comercial. Para dúvida de composição, ingredientes ou uso, não peça nada — só confirme que vai apurar.
Use SOMENTE nomes de produto que existam em PRODUTOS DA BASE abaixo; se a pessoa escreveu errado (ex.: "catchupe"), use o nome correto naturalmente, sem repetir o errado nem corrigir a pessoa. Sem listas, sem títulos, máximo 1 emoji.
PRODUTOS DA BASE:
${context || "(nenhum identificado — não cite nome de produto)"}
${extra?.firstName ? `A pessoa se chama ${extra.firstName}; use o primeiro nome uma vez.` : "Não use nome."}${voice.signature ? ` Termine com "${voice.signature}".` : ""}`,
    messages: [{ role: "user", content: `${extra?.history ? `HISTÓRICO:\n${extra.history}\n\n` : ""}MENSAGEM: ${message}\nCLASSIFICAÇÃO: ${JSON.stringify(cls)}\nEscreva só a resposta.` }],
  });
  return r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
}

/** 3c. Resposta de limite — mensagem ofensiva/preconceituosa. Passa por cima do Redator. */
export async function moderationReply(voice: BrandVoice, cls: Classification, message: string, surface: "dm" | "comment") {
  const grave = (cls.flags ?? []).some((f) => f === "discurso_odio" || f === "ameaca");
  const r = await client().messages.create({
    model: MODEL_MAIN, max_tokens: 200,
    system: `Você responde em nome da marca ${voice.name}, em português do Brasil. Tom: ${voice.persona ? "coerente com a persona (" + voice.persona.slice(0, 160) + "), porém sério" : "próximo e sério"}.
${MODERATION_RULES}
GRAU DESTA MENSAGEM: ${grave ? "GRAVE — uma frase seca, sem abertura para conversa." : "LEVE — 1 a 2 linhas, firme e cordial, pode deixar a porta aberta para falar do assunto certo (sem citar produto específico)."}
SUPERFÍCIE: ${surface === "comment" ? "comentário público." : "mensagem direta."}
Escreva só a resposta, sem emoji, sem assinatura.`,
    messages: [{ role: "user", content: `MENSAGEM (não repita nem parafraseie): ${message}\nFLAGS: ${(cls.flags ?? []).join(", ")}` }],
  });
  return r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
}

/** 4. Guardião — tom de voz + segurança + civilidade. */
export function guard(voice: BrandVoice, cls: Classification, message: string, draft: string, context: string, history = "", surface: "dm" | "comment" = "dm") {
  return json<Verdict>(MODEL_MAIN,
`Você é o revisor final das respostas da marca ${voice.name} nas redes sociais. Responda SOMENTE com JSON válido, em UMA linha, sem quebras de linha dentro dos textos:
{"verdict":"aprovada|reescrita|redirecionar|escalar|bloqueada","reason":"motivo curto","escalate_to":"comercial|tecnico|sac|null","rewrite_hint":"instrução objetiva para o redator, se reescrita"}

ORDEM DE DECISÃO: aprovada → reescrita → redirecionar → escalar → bloqueada. Use o degrau mais baixo que resolva.
REDIRECIONAR (em vez de escalar) quando a informação pedida não está no contexto MAS é pública e a pessoa pode obter sozinha: composição/ingredientes/alérgenos (rótulo, ficha do produto no site), tabela nutricional, modo de uso básico, horário/canal do SAC. Escalar só quando precisa de apuração interna (reclamação, problema com produto, risco, comercial, jurídico, crise).
BLOQUEIE (civilidade — sem exceção) se a resposta: engaja, brinca, agradece ou oferece produto em reação a uma mensagem ofensiva, machista, sexualizada ou preconceituosa (a única resposta aceitável é um limite curto e firme); contém preconceito ou generalização sobre raça, cor, etnia, gênero, orientação sexual, identidade de gênero, religião, deficiência, idade, origem regional, classe, corpo/peso ou sotaque, mesmo em tom de piada; debocha do cliente; usa palavrão, sarcasmo com pessoa irritada, conteúdo sexual ou ameaça; espelha agressividade; opina sobre política, religião, futebol ou concorrente; confirma/nega recall, processo ou boato; promete compensação/reembolso/brinde.
BLOQUEIE ou ESCALE se a resposta: garante que o produto "não faz mal"/"é seguro"/"pode consumir" (qualquer garantia de saúde, mesmo em tom leve); usa nome de produto que não existe no contexto (ex.: repete um nome digitado errado pelo cliente); dá orientação médica/nutricional individual; afirma sobre alergia/alérgeno algo que não está no contexto; fala de álcool para menor de idade; promete preço, prazo ou estoque; expõe dado pessoal; contém código/EAN/validade que não está no contexto; responde a uma reclamação séria ou pedido de indenização (→ escalar sac); pergunta técnica que o contexto não cobre (→ escalar tecnico); pedido comercial de grande volume, tabela de preço ou cadastro de distribuidor (→ escalar comercial).
FATOS DA MARCA (sempre verdadeiros): ${voice.facts.length ? voice.facts.join(" | ") : "nenhum"}.
Peça REESCRITA se: hesita ("depende", "eventual", "pode ser que", "veja no rótulo") sobre algo coberto pelos FATOS DA MARCA, ou insinua que um produto pode ter característica que os fatos negam (ex.: álcool); em comentário público passa de 3 linhas ou expõe detalhe de reclamação/dados (deveria convidar ao direct); tom robótico/corporativo, se apresenta de novo em atendimento em andamento, ignora o histórico, mais de 6 linhas, listas com marcadores, repete a pergunta, fere a persona/regras da marca, ou inventou dica sem base.
Regras extras da marca: ${voice.safety.join("; ") || "nenhuma"}.
Persona: ${voice.persona || "próxima, direta, parceira do food service"}.`,
`SUPERFÍCIE: ${surface === "comment" ? "comentário público" : "mensagem direta"}
${history ? `HISTÓRICO:\n${history}\n` : ""}MENSAGEM: ${message}
CLASSIFICAÇÃO: ${JSON.stringify(cls)}
CONTEXTO: ${context || "(vazio)"}
RASCUNHO:
${draft}`);
}
