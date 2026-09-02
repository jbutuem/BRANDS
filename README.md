# BRANDS — Plataforma Listening

Atendimento assistido por IA para DMs e comentários das marcas Kerry Brasil (SIBER, Junior, DaVinci Gourmet), com cada marca confinada no seu próprio ambiente.

- Arquitetura: [`docs/Arquitetura_Plataforma_Listening.md`](docs/Arquitetura_Plataforma_Listening.md)
- Banco e regras do Sprint 1: [`docs/SPRINT1.md`](docs/SPRINT1.md)

## Stack
Next.js 15 (App Router) na Vercel · Supabase (Postgres + pgvector + Auth + Storage), schema `listening` · GitHub Actions com teste de isolamento bloqueante (`docs/ci.yml` → mover para `.github/workflows/`).

## Rodar local
```bash
cp .env.example .env.local   # preencher as chaves
npm install
npm run dev
```

## Primeiro acesso
1. Supabase → Authentication → Users → *Add user* (e-mail + senha).
2. Entre no app. O primeiro usuário a logar, enquanto não existe nenhum membro, vira admin das três marcas automaticamente (`bootstrap_first_admin`). Depois disso, acessos são dados pela tabela `listening.brand_memberships`.
