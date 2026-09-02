# Listening — Sprint 1 (Shell + isolamento)

## Banco (Supabase Project 01, schema `listening`)
| Migration | Conteúdo |
|---|---|
| `0000_schema` | schema `listening` dedicado + grants |
| `0001_shell` | marcas, membros, papéis, `brand_settings`, helpers `auth_brand_ids()` / `auth_has_brand_role()`, seed SIBER/Junior/DVG |
| `0002_knowledge` | produtos, nutrição, distribuidores, contatos internos, receitas/dicas, documentos, chunks (pgvector), `match_chunks()` |
| `0003_operations` | conversas **anônimas**, mensagens, respostas, feedback, respostas-ouro, lacunas de base, views de BI |
| `0004_storage` | um bucket por marca com policies espelhando a RLS |
| `0005_fix_brand_triggers` | brecha achada pelo teste: `<>` vs NULL sob RLS → `is distinct from` + security definer |
| `0006_bootstrap_admin` | primeiro usuário a logar vira admin das 3 marcas (uma vez só) |

`supabase/tests/isolation.sql` — teste bloqueante no CI: usuário só-Junior não pode ver nem escrever nada de DVG (10 verificações).

## Regras que o código do app tem de respeitar
1. **`brand_id` da sessão, nunca do cliente.** `lib/brand.ts` lê o cookie e valida contra a RLS. O payload do browser não decide a marca.
2. **Service role só no servidor** e só para: ingestão (escrever chunks), gravar `responses` e `knowledge_gaps`. Toda leitura do app usa o token do usuário (RLS ativa).
3. **Scrubber antes do banco.** `messages.content` só recebe texto após mascarar telefone, e-mail, @handle, URL de perfil e nomes próprios. Não há tabela de contatos e não deve haver.
4. **Distribuidor que atende duas marcas = duas linhas.** O importador do XLSX gera uma linha por marca listada na coluna "Marcas".
5. **Prompts versionados no repo**; a persona vem de `brand_settings` em runtime.

## Configuração manual necessária (uma vez)
- Supabase → Project Settings → Data API → *Exposed schemas* → adicionar `listening`.
- Vercel → variáveis `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Mover `docs/ci.yml` para `.github/workflows/ci.yml`.

## Próximos passos (Sprint 2)
- Edge Function `ingest-document` (parse PDF/PPTX/XLSX/DOCX → chunks → embeddings)
- Importador de distribuidores (UF em array, telefone E.164, uma linha por marca)
- Importador de catálogo (códigos/EAN/DUN/NCM → `products`)
- Edição de persona / regras na tela de Configuração
