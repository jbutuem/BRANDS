import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente com o token do usuário: toda leitura passa pela RLS.
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "listening" },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          try {
            all.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            /* chamado a partir de Server Component: middleware já renovou a sessão */
          }
        },
      },
    }
  );
}
