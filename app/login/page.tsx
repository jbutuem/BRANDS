import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

async function signIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?erro=${encodeURIComponent(error.message)}`);
  redirect("/workspace");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <div className="login">
      <form action={signIn}>
        <h1>Listening</h1>
        <p className="muted">Entre com a conta criada pelo administrador.</p>
        <label>E-mail<input name="email" type="email" required autoComplete="username" /></label>
        <label>Senha<input name="password" type="password" required autoComplete="current-password" /></label>
        {erro && <div className="error">Não foi possível entrar: {erro}</div>}
        <button className="btn" type="submit">Entrar</button>
      </form>
    </div>
  );
}
