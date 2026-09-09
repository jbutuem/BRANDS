/**
 * Dados da empresa usados nas três páginas legais.
 *
 * PREENCHER ANTES DE SUBMETER À META: os campos marcados com PENDENTE aparecem
 * literalmente nas páginas públicas. Revisor da Meta lê essas páginas — placeholder
 * visível é motivo de reprovação, e o texto abaixo foi escrito para ser óbvio na tela
 * em vez de passar despercebido.
 */
export const PENDENTE = (campo: string) => `⚠ PREENCHER: ${campo}`;

export const EMPRESA = {
  razaoSocial: PENDENTE("razão social da TGT"),
  cnpj: PENDENTE("CNPJ"),
  endereco: PENDENTE("endereço completo"),
  cidade: "Campinas, São Paulo, Brasil",
  email: "contato@tgtstudio.com.br",
  atualizadoEm: "9 de setembro de 2026",
  base: "https://brands-eta-one.vercel.app",
};

/** Layout comum das páginas legais: públicas, sem login, sem navegação do app. */
export const paginaLegal: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "48px 24px",
  lineHeight: 1.6,
};
