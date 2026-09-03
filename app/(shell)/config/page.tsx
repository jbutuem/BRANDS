import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/brand";

export const dynamic = "force-dynamic";

const lines = (v: FormDataEntryValue | null) => String(v ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

async function saveVoice(formData: FormData) {
  "use server";
  const { sb, active, role } = await getSession();
  if (role !== "admin" && role !== "brand_manager") return;
  await sb.from("brand_settings").update({
    persona: String(formData.get("persona") ?? ""),
    voice_dos: lines(formData.get("dos")), voice_donts: lines(formData.get("donts")), safety_rules: lines(formData.get("safety")),
    signature: String(formData.get("signature") ?? "") || null, updated_at: new Date().toISOString(),
    official_links: Object.fromEntries(lines(formData.get("links")).map((l) => { const i = l.indexOf(":"); return i > 0 ? [l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim()] : [l.trim().toLowerCase(), ""]; }).filter(([k, v]) => k && v)),
  }).eq("brand_id", active!.id);
  revalidatePath("/config");
  redirect("/config?salvo=voz");
}

async function addContact(formData: FormData) {
  "use server";
  const { sb, active, role } = await getSession();
  if (role !== "admin" && role !== "brand_manager") return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await sb.from("internal_contacts").insert({
    brand_id: active!.id, kind: String(formData.get("kind")), name,
    email: String(formData.get("email") ?? "") || null, whatsapp: String(formData.get("whatsapp") ?? "").replace(/\D/g, "") ? "+" + String(formData.get("whatsapp")).replace(/\D/g, "") : null,
    scope: String(formData.get("scope") ?? "") || null,
  });
  revalidatePath("/config");
  redirect("/config?salvo=contato");
}

async function addQuick(formData: FormData) {
  "use server";
  const { sb, active, role } = await getSession();
  if (role !== "admin" && role !== "brand_manager") return;
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  const f = String(formData.get("from") ?? "").trim() || null, t = String(formData.get("to") ?? "").trim() || null;
  await sb.from("quick_replies").insert({ brand_id: active!.id, category: String(formData.get("category")), text, season_from: f, season_to: t });
  revalidatePath("/config"); redirect("/config?salvo=resposta");
}

async function removeQuick(formData: FormData) {
  "use server";
  const { sb, role } = await getSession();
  if (role !== "admin" && role !== "brand_manager") return;
  await sb.from("quick_replies").update({ is_active: false }).eq("id", String(formData.get("id")));
  revalidatePath("/config");
}

async function removeContact(formData: FormData) {
  "use server";
  const { sb, role } = await getSession();
  if (role !== "admin" && role !== "brand_manager") return;
  await sb.from("internal_contacts").delete().eq("id", String(formData.get("id")));
  revalidatePath("/config");
}

const ta: React.CSSProperties = { width: "100%", border: "1px solid var(--line)", borderRadius: 6, padding: 10, minHeight: 70, resize: "vertical" };
const inp: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 6, padding: 8 };

export default async function Config({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const { salvo } = await searchParams;
  const { sb, active, role } = await getSession();
  if (role !== "admin" && role !== "brand_manager") redirect("/workspace");
  const [{ data }, contacts, quick] = await Promise.all([
    sb.from("brand_settings").select("persona, voice_dos, voice_donts, safety_rules, signature, official_links").eq("brand_id", active!.id).maybeSingle(),
    sb.from("internal_contacts").select("id, kind, name, email, whatsapp, scope").eq("brand_id", active!.id).order("kind"),
    sb.from("quick_replies").select("id, category, text, season_from, season_to").eq("brand_id", active!.id).eq("is_active", true).order("category").order("created_at"),
  ]);
  const CATS: [string, string][] = [["reacoes","Reações"],["boas_vindas","Boas-vindas"],["agradecimento","Obrigado"],["engajamento","Puxar papo"],["direcionamento","Direcionar"],["espera","Espera"],["encerramento","Fechar"],["datas","Datas"]];
  return (
    <div key={active!.id}>
      <h2>Configuração da marca</h2>
      <p className="lede">Como {active!.name} fala, o que nunca diz, quais regras extras o guardião aplica e para quem encaminhar.</p>

      {salvo && <div className="panel" style={{ borderLeft: "4px solid #1b7f4b", padding: "12px 22px" }}>✓ {salvo === "voz" ? "Voz da marca salva. As próximas respostas já usam esta configuração." : salvo === "resposta" ? "Resposta pronta adicionada à biblioteca." : "Contato adicionado."}</div>}
      <form action={saveVoice} className="panel" style={{ display: "grid", gap: 14 }}>
        <label><b>Persona</b><br /><span className="muted">Quem é a marca quando responde. Uma ou duas frases.</span><textarea name="persona" defaultValue={data?.persona ?? ""} style={ta} /></label>
        <label><b>Faz</b> <span className="muted">(um por linha)</span><textarea name="dos" defaultValue={(data?.voice_dos ?? []).join("\n")} style={ta} /></label>
        <label><b>Não faz</b> <span className="muted">(um por linha)</span><textarea name="donts" defaultValue={(data?.voice_donts ?? []).join("\n")} style={ta} /></label>
        <label><b>Regras de segurança adicionais</b> <span className="muted">(um por linha — as regras base de saúde, alérgenos, álcool, preço, civilidade e prevenção de crise valem sempre)</span><textarea name="safety" defaultValue={(data?.safety_rules ?? []).join("\n")} style={ta} /></label>
        <label><b>Canais oficiais</b> <span className="muted">(um por linha, formato <code>nome: valor</code> — usados para direcionar antes de encaminhar. Ex.: site, faq, sac, rotulo, whatsapp)</span><textarea name="links" defaultValue={Object.entries((data?.official_links as Record<string, string>) ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n")} style={ta} /></label>
        <label><b>Assinatura</b> <span className="muted">(opcional)</span><br /><input name="signature" defaultValue={data?.signature ?? ""} style={{ ...inp, width: "100%" }} /></label>
        <div><button className="btn" type="submit">Salvar voz da marca</button></div>
      </form>

      <div className="panel">
        <h3>Contatos internos para encaminhamento</h3>
        <p style={{ marginBottom: 12 }}>Quando o guardião decide escalar (comercial, técnico ou SAC), estes são os destinos oferecidos ao operador.</p>
        {contacts.data?.length ? contacts.data.map((c) => (
          <form key={c.id} action={removeContact} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--line)" }}>
            <span style={{ minWidth: 90, textTransform: "capitalize" }}>{c.kind}</span><span style={{ flex: 1 }}>{c.name}{c.scope ? ` (${c.scope})` : ""} <span className="muted">{c.email ?? ""} {c.whatsapp ?? ""}</span></span>
            <input type="hidden" name="id" value={c.id} /><button type="submit" style={{ background: "none", border: "none", color: "#b3261e", textDecoration: "underline", cursor: "pointer" }}>remover</button>
          </form>
        )) : <p className="muted">Nenhum contato ainda.</p>}
        <form action={addContact} style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr 1fr 1fr auto", gap: 8, marginTop: 14, alignItems: "center" }}>
          <select name="kind" style={inp}><option value="comercial">comercial</option><option value="tecnico">técnico</option><option value="sac">SAC</option></select>
          <input name="name" placeholder="Nome" required style={inp} />
          <input name="email" placeholder="E-mail" type="email" style={inp} />
          <input name="whatsapp" placeholder="WhatsApp (DDD+número)" style={inp} />
          <input name="scope" placeholder="Escopo (região, linha…)" style={inp} />
          <button className="btn" type="submit">Adicionar</button>
        </form>
      </div>

      <div className="panel">
        <h3>Biblioteca de respostas prontas</h3>
        <p style={{ marginBottom: 12 }}>Aparecem na coluna direita da tela Responder. Use <code>{"{nome}"}</code> para o primeiro nome. Em “Datas”, informe o período (MM-DD) para aparecer só na época.</p>
        {CATS.map(([k, l]) => {
          const list = (quick.data ?? []).filter((q) => q.category === k);
          return (
            <details key={k} style={{ marginBottom: 6 }}>
              <summary>{l} <span className="muted">({list.length})</span></summary>
              {list.map((q) => (
                <form key={q.id} action={removeQuick} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0 4px 12px", fontSize: 14 }}>
                  <span style={{ flex: 1 }}>{q.text}{q.season_from ? <span className="muted"> · {q.season_from} a {q.season_to}</span> : null}</span>
                  <input type="hidden" name="id" value={q.id} /><button type="submit" style={{ background: "none", border: "none", color: "#b3261e", textDecoration: "underline", cursor: "pointer", fontSize: 13 }}>remover</button>
                </form>
              ))}
            </details>
          );
        })}
        <form action={addQuick} style={{ display: "grid", gridTemplateColumns: "150px 1fr 90px 90px auto", gap: 8, marginTop: 14, alignItems: "center" }}>
          <select name="category" style={inp}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input name="text" placeholder="Texto da resposta (pode usar {nome})" required style={inp} />
          <input name="from" placeholder="de MM-DD" style={inp} />
          <input name="to" placeholder="até MM-DD" style={inp} />
          <button className="btn" type="submit">Adicionar</button>
        </form>
      </div>
    </div>
  );
}
