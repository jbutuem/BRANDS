import { createClient } from "@supabase/supabase-js";

/**
 * Service role — SÓ no servidor e SÓ para: responses, knowledge_gaps, golden_responses.
 * Nunca use para leitura de dados do usuário; toda leitura passa pela RLS.
 */
export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    db: { schema: "listening" }, auth: { persistSession: false },
  });
}
