import { redirect } from "next/navigation";
import { getSession } from "@/lib/brand";

export default async function Config() {
  const { sb, active, role } = await getSession();
  if (role !== "admin" && role !== "brand_manager") redirect("/workspace");
  const { data } = await sb.from("brand_settings").select("persona, voice_dos, voice_donts, safety_rules").eq("brand_id", active!.id).maybeSingle();
  return (
    <>
      <h2>Configuração da marca</h2>
      <p className="lede">Como {active!.name} fala, o que nunca diz e quais regras extras o guardião de segurança aplica.</p>
      <div className="panel">
        <h3>Persona</h3>
        <p>{data?.persona || "Ainda não definida."}</p>
      </div>
      <div className="panel">
        <h3>Faz / não faz</h3>
        <p>{(data?.voice_dos?.length ?? 0) + (data?.voice_donts?.length ?? 0)} regras cadastradas. Edição entra no Sprint 2.</p>
      </div>
      <div className="panel">
        <h3>Regras de segurança adicionais</h3>
        <p>{data?.safety_rules?.length ?? 0} regras. As regras base (saúde, alérgenos, álcool, preço) valem sempre.</p>
      </div>
    </>
  );
}
