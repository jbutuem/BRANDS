import { NextResponse } from "next/server";
import { getSession } from "@/lib/brand";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { scrubRegex, scrubNames } from "@/lib/scrub";
import { classify, write, guard, safeReply, moderationReply, type BrandVoice, type Classification } from "@/lib/agents";
import { detectUf } from "@/lib/uf";
import { detectCrisis } from "@/lib/policy";

export const maxDuration = 120;
export const runtime = "nodejs";

/**
 * POST { text, channel, surface?, contactName?, conversationId?, messageId? }
 * Pipeline: Scrubber → Classificador → Retriever → Redator → Guardião (máx. 2 ciclos).
 * Mensagem ofensiva: caminho de moderação. B2B: contato do comercial vai na resposta (não se pede dados da pessoa).
 * Anotações da equipe (brand_notes) entram como fatos, padrões e dicas.
 * brand_id vem SEMPRE da sessão. Texto bruto e nome nunca são gravados.
 */
export async function POST(req: Request) {
  const t0 = Date.now();
  const body = await req.json();
  const { sb, user, active } = await getSession();
  if (!active) return NextResponse.json({ error: "sem marca ativa" }, { status: 403 });
  const brandId = active.id;

  // 0. Scrubber (regex) + 1. Classificador (também aponta nomes de pessoas)
  const rawText = String(body.text ?? "").trim();
  if (!rawText) return NextResponse.json({ error: "mensagem vazia" }, { status: 400 });
  const s = scrubRegex(rawText);
  let cls: Classification;
  try { cls = await classify(active.name, s.text); }
  catch { cls = { intent: "outro", products: [], uf: detectUf(s.text), city: null, sentiment: "neutro", personal_names: [], summary: "" }; }
  // Nome: vive só neste request. Vem do operador ou do classificador; nunca é gravado.
  const contactName: string | null = (String(body.contactName ?? "").trim() || cls.personal_names?.[0] || null);
  const firstName = contactName ? contactName.split(/\s+/)[0] : null;
  const namesToMask = [...new Set([...(cls.personal_names ?? []), ...(contactName ? [contactName, firstName!] : [])])];
  const clean = scrubNames(s.text, namesToMask, s.report);
  cls.personal_names = []; // não persiste nomes nem na classificação
  if (!cls.uf) cls.uf = detectUf(clean);
  const surface: "dm" | "comment" = body.surface === "comment" ? "comment" : "dm";
  cls.flags = [...new Set([...(cls.flags ?? []), ...(detectCrisis(clean) ? ["crise" as const] : [])])];
  const severe = (cls.flags ?? []).some((f) => f === "ameaca" || f === "crise" || f === "juridico" || f === "menor");
  // Moderação só para ódio/sexismo, ou ofensa SEM reclamação real (troll). Cliente irritado reclamando segue o fluxo normal (acolher + SAC).
  const offensive = (cls.flags ?? []).some((f) => f === "discurso_odio" || f === "sexismo") || ((cls.flags ?? []).includes("ofensa") && cls.intent !== "reclamacao");

  // Histórico do atendimento (já anonimizado) — permite continuar a conversa
  let history: { direction: string; content: string }[] = [];
  if (body.conversationId) {
    const { data: h } = await sb.from("messages").select("direction, content").eq("conversation_id", body.conversationId).order("created_at").limit(20);
    history = h ?? [];
    const prevUf = (await sb.from("conversations").select("region_uf").eq("id", body.conversationId).maybeSingle()).data?.region_uf;
    if (!cls.uf && prevUf) cls.uf = prevUf;
    const prev = (await sb.from("conversations").select("audience, business_type").eq("id", body.conversationId).maybeSingle()).data;
    if ((!cls.audience || cls.audience === "indefinido") && prev?.audience && prev.audience !== "indefinido") { cls.audience = prev.audience as "b2b" | "b2c"; cls.business_type = cls.business_type ?? prev.business_type; }
  }
  const historyText = history.length ? history.map((m) => `${m.direction === "in" ? "CLIENTE" : active.name.toUpperCase()}: ${m.content}`).join("\n") : "";

  // 2. Retriever — estruturado primeiro, texto depois (RLS + brand da sessão)
  const q = [cls.summary, ...(cls.products ?? [])].filter(Boolean).join(" ") || clean;
  const [voiceRow, prods, dists, chunks, golden, contacts, notesAll, notesHit] = await Promise.all([
    sb.from("brand_settings").select("persona, voice_dos, voice_donts, safety_rules, signature, official_links, brand_facts, b2b_offers").eq("brand_id", brandId).maybeSingle(),
    sb.rpc("search_products", { p_brand_id: brandId, p_query: (cls.products?.[0] ?? q), p_limit: 6 }),
    cls.uf ? sb.rpc("distributors_by_uf", { p_brand_id: brandId, p_uf: cls.uf }) : Promise.resolve({ data: [] as never[] }),
    sb.rpc("search_chunks", { p_brand_id: brandId, p_query: q, p_limit: 5 }),
    sb.from("golden_responses").select("question, answer").eq("brand_id", brandId).textSearch("tsv", q.split(/\s+/).slice(0, 6).join(" | "), { config: "portuguese" }).limit(3),
    sb.from("internal_contacts").select("id, kind, name, email, whatsapp, phone, scope").eq("brand_id", brandId).eq("is_active", true),
    sb.from("brand_notes").select("kind, title, body").eq("brand_id", brandId).eq("is_active", true).in("kind", ["fato", "padrao"]),
    sb.from("brand_notes").select("kind, title, body").eq("brand_id", brandId).eq("is_active", true).in("kind", ["dica", "correcao"]).textSearch("tsv", q.split(/\s+/).filter((w) => w.length > 3).slice(0, 8).join(" | ") || q, { config: "portuguese" }).limit(5),
  ]);
  const noteFacts = (notesAll.data ?? []).filter((n) => n.kind === "fato").map((n) => (n.title ? n.title + ": " : "") + n.body);
  const notePatterns = (notesAll.data ?? []).filter((n) => n.kind === "padrao").map((n) => (n.title ? n.title + ": " : "") + n.body);
  const noteTips = (notesHit.data ?? []).map((n) => `[${n.kind === "correcao" ? "CORREÇÃO" : "DICA"}${n.title ? " · " + n.title : ""}] ${n.body}`);

  const voice: BrandVoice = {
    name: active.name,
    persona: voiceRow.data?.persona ?? "",
    dos: [...(voiceRow.data?.voice_dos ?? []), ...notePatterns], donts: voiceRow.data?.voice_donts ?? [], safety: voiceRow.data?.safety_rules ?? [],
    signature: voiceRow.data?.signature ?? null, links: (voiceRow.data?.official_links as Record<string, string>) ?? {}, facts: [...(voiceRow.data?.brand_facts ?? []), ...noteFacts], offers: voiceRow.data?.b2b_offers ?? [],
  };
  type P = { id: string; name: string; codigo: string | null; line: string | null; packaging: string | null; shelf_life: string | null; units_per_box: number | null; applications: string[]; status: string; ean: string | null };
  type D = { id: string; fantasia: string; cidade: string | null; ufs: string[]; whatsapp: string | null; telefone: string | null; email: string | null };
  type C = { chunk_id: string; document_name: string; content: string; page: number | null };
  const P_ = (prods.data ?? []) as P[]; const D_ = (dists.data ?? []) as D[]; const C_ = (chunks.data ?? []) as C[];

  const ctx = [
    P_.length ? "PRODUTOS:\n" + P_.map((p) => `- ${p.name} | cód. ${p.codigo ?? "?"} | ${p.line ?? ""} | ${p.packaging ?? ""} | validade ${p.shelf_life ?? "?"} | ${p.units_per_box ?? "?"}/caixa | aplicações: ${p.applications.join(", ")} | ${p.status}`).join("\n") : "",
    D_.length ? `DISTRIBUIDORES EM ${cls.uf}:\n` + D_.map((d) => `- ${d.fantasia} (${d.cidade ?? ""}) — WhatsApp ${d.whatsapp ?? d.telefone ?? "?"} — ${d.email ?? ""}`).join("\n") : "",
    C_.length ? "TRECHOS DE MATERIAIS DA MARCA:\n" + C_.map((c) => `[${c.document_name}${c.page ? ` p.${c.page}` : ""}] ${c.content.slice(0, 900)}`).join("\n\n") : "",
    noteTips.length ? "ANOTAÇÕES DA EQUIPE (prevalecem sobre o resto):\n" + noteTips.join("\n") : "",
    Object.keys(voice.links).length ? "LINKS OFICIAIS: " + Object.entries(voice.links).map(([k, v]) => `${k}: ${v}`).join(" · ") : "",
  ].filter(Boolean).join("\n\n");
  const examples = (golden.data ?? []).map((g) => `P: ${g.question}\nR: ${g.answer}`).join("\n\n");

  // lacunas de base
  const admin = supabaseAdmin();
  const gaps: { gap_type: string; detail: string }[] = [];
  if (cls.intent === "onde_comprar" && cls.uf && !D_.length) gaps.push({ gap_type: "uf_sem_distribuidor", detail: cls.uf });
  if (cls.intent === "produto" && cls.products?.length && !P_.length) gaps.push({ gap_type: "produto_nao_encontrado", detail: cls.products.join(", ").slice(0, 120) });
  if ((cls.intent === "tecnica") && !C_.length) gaps.push({ gap_type: "sem_material_tecnico", detail: cls.summary.slice(0, 120) });
  for (const g of gaps) {
    await admin.rpc("upsert_gap", { p_brand_id: brandId, p_type: g.gap_type, p_detail: g.detail }).then(() => null, () => null);
  }

  // Contato comercial a ser passado ao cliente (B2B): prioriza escopo que cite a UF/cidade, senão o geral
  type IC = { id: string; kind: string; name: string; email: string | null; whatsapp: string | null; phone: string | null; scope: string | null };
  const comm = ((contacts.data ?? []) as IC[]).filter((c) => c.kind === "comercial");
  const pick = comm.find((c) => cls.uf && c.scope && c.scope.toUpperCase().includes(cls.uf)) ?? comm.find((c) => !c.scope || /geral|brasil|nacional/i.test(c.scope)) ?? comm[0];
  const commercialText = pick ? `${pick.name}${pick.scope ? ` (${pick.scope})` : ""} — ${[pick.whatsapp ? "WhatsApp " + pick.whatsapp : null, pick.email ? "e-mail " + pick.email : null].filter(Boolean).join(", ") || "sem canal cadastrado"}` : "";

  // 3+4. Redator ↔ Guardião (máx. 2 reescritas)
  let draft = "", verdict: Awaited<ReturnType<typeof guard>> = { verdict: "aprovada", reason: "" }, cycles = 0, hint: string | undefined;
  try {
    // Mensagem ofensiva/preconceituosa: não passa pelo Redator. Sai resposta de limite (uma linha) e recomendação de moderação.
    if (offensive && !severe) {
      draft = await moderationReply(voice, cls, clean, surface);
      verdict = { verdict: "moderacao", reason: `mensagem com ${(cls.flags ?? []).join(", ")}`, escalate_to: null };
    } else for (;;) {
      draft = await write(voice, cls, clean, ctx, examples, hint, { firstName, history: historyText, surface, commercial: commercialText });
      try { verdict = await guard(voice, cls, clean, draft, ctx, historyText, surface); if (String(verdict.escalate_to) === "null" || !verdict.escalate_to) verdict.escalate_to = null; }
      catch { verdict = cycles < 2 ? { verdict: "reescrita", reason: "revisor ilegível", rewrite_hint: "responda mais curto e simples" } : { verdict: "escalar", reason: "revisor indisponível", escalate_to: "sac" }; }
      // Sinal de crise/ameaça/jurídico/menor: nunca sai resposta direta — vai para o SAC com acolhimento neutro.
      if (severe && verdict.verdict !== "bloqueada") { verdict = { verdict: "escalar", reason: `sinal sensível: ${(cls.flags ?? []).join(", ")}`, escalate_to: "sac" }; break; }
      if (verdict.verdict !== "reescrita" || cycles >= 2) break;
      cycles++; hint = verdict.rewrite_hint ?? verdict.reason;
    }
    // Reprovado ou redirecionado pelo Guardião: o rascunho é descartado e sai uma resposta segura.
    if (verdict.verdict === "escalar" || verdict.verdict === "bloqueada" || verdict.verdict === "redirecionar") {
      draft = await safeReply(voice, cls, clean, verdict.reason, (verdict.escalate_to && String(verdict.escalate_to) !== "null") ? verdict.escalate_to : null, P_.length ? P_.map((p) => `- ${p.name} (${p.line ?? ""}, ${p.packaging ?? ""})`).join("\n") : "", { firstName, history: historyText, surface, mode: verdict.verdict });
    }
  } catch (e) {
    return NextResponse.json({ error: `IA indisponível: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }

  // Persistência — conversa/mensagem via usuário (RLS); response via service role
  let conversationId: string = body.conversationId ?? "";
  let messageId: string = body.messageId ?? "";
  if (!conversationId) {
    const { data: conv, error } = await sb.from("conversations").insert({
      brand_id: brandId, channel: body.channel ?? "instagram", intent: cls.intent, region_uf: cls.uf, region_city: cls.city, operator_id: user.id, surface, flags: cls.flags ?? [], audience: cls.audience ?? "indefinido", business_type: cls.business_type ?? null,
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    conversationId = conv.id;
  } else {
    await sb.from("conversations").update({ last_activity: new Date().toISOString(), status: "aberta", flags: cls.flags ?? [], ...(cls.audience && cls.audience !== "indefinido" ? { audience: cls.audience, business_type: cls.business_type ?? null } : {}), ...(cls.uf ? { region_uf: cls.uf } : {}), ...(cls.city ? { region_city: cls.city } : {}) }).eq("id", conversationId);
  }
  await sb.from("conversations").update({ summary: (cls.summary || clean).slice(0, 140) }).eq("id", conversationId);
  if (!messageId) {
    const { data: msg, error } = await sb.from("messages").insert({
      conversation_id: conversationId, brand_id: brandId, direction: "in", content: clean, scrub_report: s.report,
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    messageId = msg.id;
  }
  const storedDraft = firstName ? draft.replace(new RegExp(firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[nome]") : draft;
  const { count } = await admin.from("responses").select("*", { count: "exact", head: true }).eq("message_id", messageId);
  const { data: resp, error: rerr } = await admin.from("responses").insert({
    message_id: messageId, brand_id: brandId, version: (count ?? 0) + 1, content: storedDraft,
    sources: { product_ids: P_.map((p) => p.id), distributor_ids: D_.map((d) => d.id), chunk_ids: C_.map((c) => c.chunk_id) },
    classifier_out: cls, verdict: verdict.verdict, verdict_reason: verdict.reason, rewrite_cycles: cycles,
    model: process.env.CLAUDE_MODEL ?? "claude-sonnet-5", latency_ms: Date.now() - t0,
  }).select("id, version").single();
  if (rerr) return NextResponse.json({ error: rerr.message }, { status: 500 });

  const escTo = verdict.escalate_to && String(verdict.escalate_to) !== "null" ? verdict.escalate_to : null;
  const esc = escTo ? (contacts.data ?? []).filter((c) => c.kind === escTo) : [];
  const commercial = (contacts.data ?? []).filter((c) => c.kind === "comercial");
  return NextResponse.json({
    conversationId, messageId, responseId: resp.id, version: resp.version,
    text: draft, verdict: verdict.verdict, reason: verdict.reason, escalateTo: escTo, contacts: esc, commercial,
    classification: { intent: cls.intent, uf: cls.uf, city: cls.city, sentiment: cls.sentiment, summary: cls.summary, flags: cls.flags ?? [], surface, audience: cls.audience ?? "indefinido", businessType: cls.business_type ?? null, businessName: cls.business_name ?? null, leadSignals: cls.lead_signals ?? [], products: cls.products ?? [] },
    sources: { products: P_.map((p) => p.name), distributors: D_.map((d) => d.fantasia), documents: [...new Set(C_.map((c) => c.document_name))] },
    scrub: s.report, cleanText: clean, latencyMs: Date.now() - t0,
  });
}
