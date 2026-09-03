import Anthropic from "@anthropic-ai/sdk";

const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export const MODEL_FAST = process.env.CLAUDE_MODEL_FAST ?? "claude-haiku-4-5-20251001";
export const MODEL_MAIN = process.env.CLAUDE_MODEL ?? "claude-sonnet-5";

export type Intent = "produto" | "onde_comprar" | "tecnica" | "engajamento" | "reclamacao" | "risco" | "outro";
export type Classification = {
  intent: Intent; products: string[]; uf: string | null; city: string | null;
  sentiment: "positivo" | "neutro" | "negativo"; personal_names: string[]; summary: string;
};
export type BrandVoice = { name: string; persona: string; dos: string[]; donts: string[]; safety: string[]; signature: string | null; links: Record<string, string> };
export type Verdict = { verdict: "aprovada" | "reescrita" | "escalar" | "bloqueada"; reason: string; escalate_to?: "comercial" | "tecnico" | "sac" | null; rewrite_hint?: string };

async function json<T>(model: string, system: string, user: string, max = 1200): Promise<T> {
  const r = await client().messages.create({ model, max_tokens: max, system, messages: [{ role: "user", content: user }] });
  const text = r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean) as T;
}

/** 1. Classificador (rápido). Também devolve nomes próprios para o Scrubber. */
export function classify(brand: string, text: string) {
  return json<Classification>(MODEL_FAST,
`Você classifica mensagens recebidas nas redes sociais da marca ${brand} (food service, Brasil). Responda SOMENTE com JSON válido, sem comentários:
{"intent":"produto|onde_comprar|tecnica|engajamento|reclamacao|risco|outro","products":["nomes de produtos citados"],"uf":"UF em 2 letras ou null","city":"cidade ou null","sentiment":"positivo|neutro|negativo","personal_names":["nomes de PESSOAS citados no texto, nunca marcas ou produtos"],"summary":"o que a pessoa quer, em uma frase"}
Regras: "risco" = saúde, alergia grave, intoxicação, menor de idade, ameaça, pedido de dado pessoal. "reclamacao" = produto com defeito, atraso, atendimento ruim. "tecnica" = como usar, rendimento, conservação, tabela nutricional, alérgenos.`,
    text);
}

/** 3. Redator — escreve como a marca. */
export async function write(voice: BrandVoice, cls: Classification, message: string, context: string, examples: string, hint?: string, extra?: { firstName: string | null; history: string }) {
  const r = await client().messages.create({
    model: MODEL_MAIN, max_tokens: 700,
    system: `Você responde, em nome da marca ${voice.name}, mensagens de clientes e leads nas redes sociais (Instagram/Facebook/WhatsApp), em português do Brasil.

PERSONA: ${voice.persona || `${voice.name} fala como uma pessoa da equipe: próxima, direta, entusiasmada com comida e com o negócio do cliente. Trata o cliente como parceiro de food service.`}
FAÇA: ${voice.dos.length ? voice.dos.join("; ") : "seja específico; use o nome do produto; sugira uma aplicação, dica ou receita quando fizer sentido; faça uma pergunta de continuidade quando faltar informação (ex.: cidade)"}
NÃO FAÇA: ${voice.donts.length ? voice.donts.join("; ") : "não use tom corporativo nem jargão; não comece com 'Olá! Agradecemos o contato'; não use emojis em excesso (máx. 1); não invente dados"}
${voice.signature ? `ASSINATURA: termine com "${voice.signature}"` : ""}

REGRAS DURAS:
- Só afirme código, validade, peso, EAN, rendimento, ingredientes e alérgenos que estejam no CONTEXTO abaixo. Se não estiver, diga que vai confirmar.
- Use SOMENTE nomes de produto que existam no CONTEXTO. Se o cliente escreveu o nome errado ou abreviado (ex.: "griu", "maionese grio"), use o nome correto da base naturalmente, sem corrigir a pessoa e sem repetir o nome errado. Se nenhum produto da base corresponder, diga que não identificou o produto e pergunte qual é.
- NUNCA garanta que um produto "não faz mal", "é seguro", "pode consumir" ou dê qualquer garantia de saúde, mesmo em tom leve. Para perguntas de segurança alimentar, alergia, gestante, criança ou mal-estar: acolha, informe só o que está no rótulo/contexto (validade, conservação, ingredientes) e direcione ao SAC. Se houver relato de problema com o produto, peça lote e validade e encaminhe.
- Nunca dê orientação médica ou nutricional individual; nunca prometa preço, prazo de entrega ou disponibilidade.
- Se a pessoa não disse a cidade/UF e a dúvida é onde comprar, pergunte a cidade de forma natural.
- Se a mensagem é reclamação, acolha, não se justifique, e direcione para o canal certo.
- Não repita a pergunta da pessoa. Máximo 6 linhas. Sem títulos, sem listas com marcadores.
- Não mencione que existe um "contexto" nem que você é uma IA.
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

/** 3b. Resposta segura — usada quando o Guardião decide escalar/bloquear: acolhe e direciona, sem afirmar nada de risco. */
export async function safeReply(voice: BrandVoice, cls: Classification, message: string, reason: string, escalateTo: string | null, extra?: { firstName: string | null; history: string }) {
  const r = await client().messages.create({
    model: MODEL_MAIN, max_tokens: 400,
    system: `Você responde em nome da marca ${voice.name}, em português do Brasil. PERSONA: ${voice.persona || "próxima, direta, parceira do food service"}.
Esta mensagem foi marcada pelo revisor como "${escalateTo ? "encaminhar para " + escalateTo : "bloqueada"}" pelo motivo: ${reason}.
Escreva uma resposta curta (até 4 linhas) que: acolhe a pessoa; NÃO afirma nada sobre segurança, saúde, alergia, preço, prazo ou estoque; NÃO promete resultado; diz que vai passar para ${escalateTo === "sac" ? "o atendimento ao consumidor" : escalateTo === "tecnico" ? "o time técnico" : escalateTo === "comercial" ? "o time comercial" : "a equipe responsável"} e, se fizer sentido, pede a informação necessária para isso (lote e validade em caso de problema com produto; cidade e tipo de negócio em caso comercial). Sem listas, sem títulos, máximo 1 emoji.
${extra?.firstName ? `A pessoa se chama ${extra.firstName}; use o primeiro nome uma vez.` : "Não use nome."}${voice.signature ? ` Termine com "${voice.signature}".` : ""}`,
    messages: [{ role: "user", content: `${extra?.history ? `HISTÓRICO:\n${extra.history}\n\n` : ""}MENSAGEM: ${message}\nCLASSIFICAÇÃO: ${JSON.stringify(cls)}\nEscreva só a resposta.` }],
  });
  return r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
}

/** 4. Guardião — tom de voz + segurança. */
export function guard(voice: BrandVoice, cls: Classification, message: string, draft: string, context: string, history = "") {
  return json<Verdict>(MODEL_MAIN,
`Você é o revisor final das respostas da marca ${voice.name} nas redes sociais. Responda SOMENTE com JSON válido:
{"verdict":"aprovada|reescrita|escalar|bloqueada","reason":"motivo curto","escalate_to":"comercial|tecnico|sac|null","rewrite_hint":"instrução objetiva para o redator, se reescrita"}

BLOQUEIE ou ESCALE se a resposta: garante que o produto "não faz mal"/"é seguro"/"pode consumir" (qualquer garantia de saúde, mesmo em tom leve); usa nome de produto que não existe no contexto (ex.: repete um nome digitado errado pelo cliente); dá orientação médica/nutricional individual; afirma sobre alergia/alérgeno algo que não está no contexto; fala de álcool para menor de idade; promete preço, prazo ou estoque; expõe dado pessoal; contém código/EAN/validade que não está no contexto; responde a uma reclamação séria ou pedido de indenização (→ escalar sac); pergunta técnica que o contexto não cobre (→ escalar tecnico); pedido comercial de grande volume, tabela de preço ou cadastro de distribuidor (→ escalar comercial).
Peça REESCRITA se: tom robótico/corporativo, se apresenta de novo em atendimento em andamento, ignora o histórico, mais de 6 linhas, listas com marcadores, repete a pergunta, fere a persona/regras da marca, ou inventou dica sem base.
Regras extras da marca: ${voice.safety.join("; ") || "nenhuma"}.
Persona: ${voice.persona || "próxima, direta, parceira do food service"}.`,
`${history ? `HISTÓRICO:\n${history}\n` : ""}MENSAGEM: ${message}
CLASSIFICAÇÃO: ${JSON.stringify(cls)}
CONTEXTO: ${context || "(vazio)"}
RASCUNHO:
${draft}`);
}
