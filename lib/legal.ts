/**
 * Dados da empresa usados nas três páginas legais (/privacidade, /termos,
 * /exclusao-de-dados). Um lugar só: alterar aqui vale para as três.
 */
export const EMPRESA = {
  razaoSocial: "João Ricardo Butuem & Cia Ltda - ME",
  cnpj: "07.374.802/0001-00",
  endereco: "Rua Frei Manoel da Ressurreição, 1488, sala 04, CEP 13073-027",
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
