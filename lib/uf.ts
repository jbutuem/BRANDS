const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const UF_NAMES: Record<string, string> = { "goiás":"GO","goias":"GO","são paulo":"SP","sao paulo":"SP","minas":"MG","rio de janeiro":"RJ","rio":"RJ","paraná":"PR","parana":"PR","santa catarina":"SC","tocantins":"TO","mato grosso do sul":"MS","mato grosso":"MT","brasília":"DF","brasilia":"DF","espírito santo":"ES","espirito santo":"ES","bahia":"BA","rio grande do sul":"RS","pernambuco":"PE","ceará":"CE","ceara":"CE","distrito federal":"DF" };

export function detectUf(q: string): string | null {
  const s = q.toLowerCase();
  for (const [name, uf] of Object.entries(UF_NAMES)) if (s.includes(name)) return uf;
  const m = q.match(/\b([A-Z]{2})\b/);
  if (m && UFS.includes(m[1])) return m[1];
  return null;
}
