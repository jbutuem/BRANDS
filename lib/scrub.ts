/**
 * Scrubber — passo 0. Mascara dados pessoais ANTES de qualquer gravação.
 * O texto bruto só existe na memória do request.
 */
export type ScrubReport = { phones: number; emails: number; handles: number; urls: number; names: number };

const PHONE = /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s.]?\d{4}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const HANDLE = /(?<![\w])@[\w.]{2,}/g;
const URL = /https?:\/\/\S+|(?:www\.)\S+|(?:instagram|facebook|wa\.me|t\.me)\S*/gi;

export function scrubRegex(text: string): { text: string; report: ScrubReport } {
  const report: ScrubReport = { phones: 0, emails: 0, handles: 0, urls: 0, names: 0 };
  let t = text;
  t = t.replace(EMAIL, () => { report.emails++; return "[email]"; });
  t = t.replace(URL, () => { report.urls++; return "[link]"; });
  t = t.replace(HANDLE, () => { report.handles++; return "[perfil]"; });
  t = t.replace(PHONE, (m) => { if (m.replace(/\D/g, "").length < 10) return m; report.phones++; return "[telefone]"; });
  return { text: t, report };
}

/** Aplica os nomes próprios que o Classificador detectou. */
export function scrubNames(text: string, names: string[], report: ScrubReport): string {
  let t = text;
  for (const n of names.filter((x) => x && x.trim().length > 1)) {
    const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    t = t.replace(re, () => { report.names++; return "[nome]"; });
  }
  return t;
}
