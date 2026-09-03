import { NextResponse } from "next/server";
import { getSession } from "@/lib/brand";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { scrubRegex, scrubNames } from "@/lib/scrub";
import { classify, write, guard, type BrandVoice, type Classification } from "@/lib/agents";
import { detectUf } from "@/lib/uf";

export const maxDuration = 120;
export const runtime = "nodejs";

/**
 * POST { text, channel, contactName?, conversationId?, messageId? }
 * Pipeline: Scrubber → Classificador → Retriever → Redator → Guardião (máx. 2 ciclos).
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

  // Histórico do atendimento (já anonimizado) — permite continuar a conversa
  let history: { direction: string; content: string }[] = [];
  if (body.conversationId) {
    const { data: h } = await sb.from("messages").select("direction, content").eq("conversation_id", body.conversationId).order("created_at").limit(20);
    history = h ?? [];
    const prevUf = (await sb.from("conversations").select("region_uf").eq("id", body.conversationId).maybeSingle()).data?.region_uf;
    if (!cls.uf && prevUf) cls.uf = prevUf;
  }
  const historyText = history.length ? history.map((m) => `${m.direction === "in" ? "CLIENTE" : active.name.toUpperCase()}: ${m.content}`).join("\n") : "";

  // 2. Retriever — estruturado primeiro, texto depois (RLS + brand da sessão)
  const q = [cls.summary, ...(cls.products ?? [])].filter(Boolean).join(" ") || clean;
  const [voiceRow, prods, dists, chunks, golden, contacts] = await Promise.all([
    sb.from("brand_settings").select("persona, voice_dos, voice_donts, safety_rules, signature, official_links").eq("brand_id", brandId).maybeSingle(),
    sb.rpc("search_products", { p_brand_id: brandId, p_query: q, p_limit: 6 }),
    cls.uf ? sb.rpc("distributors_by_uf", { p_brand_id: brandId, p_uf: cls.uf }) : Promise.resolve({ data: [] as never[] }),
    sb.rpc("search_chunks", { p_brand_id: brandId, p_query: q, p_limit: 5 }),
    sb.from("golden_responses").select("question, answer").eq("brand_id", brandId).textSearch("tsv", q.split(/\s+/).slice(0, 6).join(" | "), { config: "portuguese" }).limit(3),
    sb.from("internal_contacts").select("id, kind, name, email, whatsapp, phone, scope").eq("brand_id", brandId).eq("is_active", true),
  ]);

  const voice: BrandVoice = {
    name: active.name,
    persona: voiceRow.data?.persona ?? "",
    dos: voiceRow.data?.voice_dos ?? [], donts: voiceRow.data?.voice_donts ?? [], safety: voiceRow.data?.safety_rules ?? [],
    signature: voiceRow.data?.signature ?? null, links: (voiceRow.data?.official_links as Record<string, string>) ?? {},
  };
  type P = { id: string; name: string; codigo: string | null; line: string | null; packaging: string | null; shelf_life: string | null; units_per_box: number | null; applications: string[]; status: string; ean: string | null };
  type D = { id: string; fantasia: string; cidade: string | null; ufs: string[]; whatsapp: string | null; telefone: string | null; email: string | null };
  type C = { chunk_id: string; document_name: string; content: string; page: number | null };
  const P_ = (prods.data ?? []) as P[]; const D_ = (dists.data ?? []) as D[]; const C_ = (chunks.data ?? []) as C[];

  const ctx = [
    P_.length ? "PRODUTOS:\n" + P_.map((p) => `- ${p.name} | cód. ${p.codigo ?? "?"} | ${p.line ?? ""} | ${p.packaging ?? ""} | validade ${p.shelf_life ?? "?"} | ${p.units_per_box ?? "?"}/caixa | aplicações: ${p.applications.join(", ")} | ${p.status}`).join("\n") : "",
    D_.length ? `DISTRIBUIDORES EM ${cls.uf}:\n` + D_.map((d) => `- ${d.fantasia} (${d.cidade ?? ""}) — WhatsApp ${d.whatsapp ?? d.telefone ?? "?"} — ${d.email ?? ""}`).join("\n") : "",
    C_.length ? "TRECHOS DE MATERIAIS DA MARCA:\n" + C_.map((c) => `[${c.document_name}${c.page ? ` p.${c.page}` : ""}] ${c.content.slice(0, 900)}`).join("\n\n") : "",
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

  // 3+4. Redator ↔ Guardião (máx. 2 reescritas)
  let draft = "", verdict = { verdict: "aprovada" as const, reason: "" } as Awaited<ReturnType<typeof guard>>, cycles = 0, hint: string | undefined;
  try {
    for (;;) {
      draft = await write(voice, cls, clean, ctx, examples, hint, { firstName, history: historyText });
      verdict = await guard(voice, cls, clean, draft, ctx, historyText);
      if (verdict.verdict !== "reescrita" || cycles >= 2) break;
      cycles++; hint = verdict.rewrite_hint ?? verdict.reason;
    }
  } catch (e) {
    return NextResponse.json({ error: `IA indisponível: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }

  // Persistência — conversa/mensagem via usuário (RLS); response via service role
  let conversationId: string = body.conversationId ?? "";
  let messageId: string = body.messageId ?? "";
  if (!conversationId) {
    const { data: conv, error } = await sb.from("conversations").insert({
      brand_id: brandId, channel: body.channel ?? "instagram", intent: cls.intent, region_uf: cls.uf, region_city: cls.city, operator_id: user.id,
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    conversationId = conv.id;
  } else {
    await sb.from("conversations").update({ last_activity: new Date().toISOString(), status: "aberta", ...(cls.uf ? { region_uf: cls.uf } : {}), ...(cls.city ? { region_city: cls.city } : {}) }).eq("id", conversationId);
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

  const esc = verdict.escalate_to ? (contacts.data ?? []).filter((c) => c.kind === verdict.escalate_to) : [];
  return NextResponse.json({
    conversationId, messageId, responseId: resp.id, version: resp.version,
    text: draft, verdict: verdict.verdict, reason: verdict.reason, escalateTo: verdict.escalate_to ?? null, contacts: esc,
    classification: { intent: cls.intent, uf: cls.uf, sentiment: cls.sentiment, summary: cls.summary },
    sources: { products: P_.map((p) => p.name), distributors: D_.map((d) => d.fantasia), documents: [...new Set(C_.map((c) => c.document_name))] },
    scrub: s.report, cleanText: clean, latencyMs: Date.now() - t0,
  });
}
