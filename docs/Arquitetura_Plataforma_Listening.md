# Plataforma Listening — Arquitetura v0.1

**Stack:** GitHub → Vercel (Next.js App Router) → Supabase (Postgres + pgvector + Auth + Storage + Edge Functions)
**Marcas iniciais:** SIBER · Junior · DaVinci Gourmet (DVG)
**Diretriz inegociável:** Shell hermético; cada marca confinada no seu ambiente. Nenhum dado, documento, embedding ou resposta de uma marca é visível ou recuperável a partir de outra.

---

## 1. Visão geral (camadas)

```
┌─────────────────────────── SHELL (Next.js / Vercel) ───────────────────────────┐
│  Seletor de marca │ Config. de marca │ Aprendizado (uploads) │ Workspace │ BI   │
└───────────────┬────────────────────────────────────────────────┬───────────────┘
                │ Server Actions / Route Handlers (nunca chamada direta do browser à IA)
┌───────────────▼──────────────── ORQUESTRADOR ──────────────────▼───────────────┐
│  0 Scrubber → 1 Classificador → 2 Retriever (SQL + vetor) → 3 Redator → 4 Guardião │
└───────────────┬────────────────────────────────────────────────────────────────┘
┌───────────────▼──────────────── SUPABASE ──────────────────────────────────────┐
│  Postgres + RLS por brand_id │ pgvector │ Storage (bucket por marca) │ Auth     │
│  Edge Functions: ingestão de documentos (PDF/PPTX/XLSX/DOCX/TXT → chunks)      │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Isolamento por marca (o "hermético")

O isolamento é aplicado em **quatro camadas independentes**. Qualquer uma que falhe, as outras seguram.

| Camada | Mecanismo |
|---|---|
| Banco | Toda tabela de domínio tem `brand_id NOT NULL` + **Row Level Security** ativa. Política: `brand_id IN (select brand_id from brand_memberships where user_id = auth.uid())`. |
| Storage | Um bucket por marca (`brand-siber`, `brand-junior`, `brand-dvg`) com policy espelhando a RLS. Nunca um bucket compartilhado com subpastas. |
| Retrieval | A função de busca vetorial (`match_chunks`) recebe `brand_id` como parâmetro **fixado no servidor** a partir da sessão, nunca do payload do cliente. Filtro `WHERE brand_id = $1` antes do `ORDER BY embedding <=> $2`. |
| Prompt | O contexto enviado ao modelo é montado só com registros já filtrados. O system prompt da marca é carregado por `brand_id`. Sem "memória" cross-brand. |

**Teste de isolamento obrigatório a cada rodada (CI):** um usuário só-Junior tenta ler e escrever dados de DVG por todas as vias (tabelas, busca por UF, chunks, conversas, triggers). Tudo deve retornar vazio/negado. Falhou → deploy bloqueado. O teste já pegou uma brecha real (trigger com `<>` vs NULL sob RLS) antes do primeiro deploy.

---

## 3. Modelo de dados (Postgres, schema `listening`)

### 3.1 Shell / controle
- `brands` — id, slug, nome, site, status
- `brand_memberships` — user_id, brand_id, role (`admin` | `brand_manager` | `operator`)
- `brand_settings` — brand_id, tom de voz (persona, do's/don'ts), regras de segurança específicas, saudação/assinatura, links oficiais

### 3.2 Base de conhecimento estruturada (consulta determinística via SQL)
Dados que precisam de resposta exata **não** vão só para RAG — ficam em tabelas.

- `products` — brand_id, código, nome, linha/categoria, embalagem, peso, validade, ean, dun, ncm, qtd_caixa, aplicações, status
- `product_nutrition` — product_id, porção, tabela nutricional (jsonb), alérgenos (array), claims
- `distributors` — brand_id, razao_social, fantasia, contato, telefone, whatsapp, email, endereço, cidade, **ufs (array)**, vendedor_kerry. Um distribuidor que atende Junior **e** DVG vira **duas linhas** (uma por marca).
- `internal_contacts` — brand_id, tipo (`comercial` | `tecnico` | `sac`), nome, email, telefone, escopo — destino de encaminhamento
- `recipes_tips` — brand_id, título, texto, produtos relacionados, link (base para respostas "não robóticas")

> **Nota sobre a planilha de distribuidores:** a coluna UF traz múltiplos estados na mesma célula (`DF/GO/MT/TO/MS`), a coluna Marcas é texto livre (`Junior e DVG` / `Junior/DVG`) e telefones estão em formatos mistos. Na ingestão: explodir UF em array, gerar uma linha por marca listada e padronizar telefone E.164.

### 3.3 Base de conhecimento não-estruturada (RAG)
- `documents` — brand_id, nome, tipo, storage_path, status (`processing` | `ready` | `error`), páginas
- `document_chunks` — document_id, brand_id (redundante de propósito), conteúdo, página, embedding `vector(1536)`, metadata

### 3.4 Operação e BI
- **Sem tabela de contatos.** Nenhum nome, handle ou ID da Meta é gravado. O operador cola só o teor; se colar nome junto, o **Scrubber** remove antes de persistir.
- `conversations` — brand_id, canal, status, intenção, região (só UF/cidade), encaminhado_para
- `messages` — conversation_id, direção (`in` | `out`), texto **já anonimizado**
- `responses` — message_id, versão, texto gerado, fontes (jsonb), veredito do guardião, motivo, modelo, tokens, latência
- `feedback` — response_id, tipo (`gostei` | `nao_gostei` | `copiada` | `regerada` | `enviada`)
- `golden_responses` — few-shot por marca promovido de 👍
- `knowledge_gaps` — quando o retriever volta vazio (UF sem distribuidor, produto sem nutrição…)
- Views de BI: `bi_daily_volume`, `bi_response_quality`, `bi_top_gaps`, `bi_regions`

---

## 4. Pipeline de ingestão (área de Aprendizado)

1. Upload no Shell → Storage do bucket da marca → registro em `documents` (`processing`)
2. Edge Function faz parse por tipo: PDF (`unpdf`, fallback OCR para catálogos em imagem), PPTX (`officeparser`), DOCX (`mammoth`), XLSX (SheetJS)
3. **Roteamento inteligente:** XLSX com colunas reconhecidas → importar para `distributors`; PDF de catálogo com códigos/EAN → `products` **e** chunks
4. Chunking (~500 tokens, overlap 50) → embeddings → `document_chunks`
5. Status `ready`; contagem de chunks visível e teste com uma pergunta na própria tela

---

## 5. Pipeline de resposta

Entrada: operador cola a(s) **mensagem(ns)** no Workspace da marca selecionada. Não há campo de nome.

| # | Agente | Faz | Sai |
|---|---|---|---|
| 0 | **Scrubber** | Mascara dado pessoal antes de qualquer gravação: telefone, e-mail, @handle, URL de perfil, nomes próprios → `[telefone]`, `[email]`, `[nome]`. O texto original nunca toca o banco | texto limpo |
| 1 | **Classificador** | Intenção, entidades (produto, código, cidade/UF, canal), idioma, sentimento | JSON |
| 2 | **Retriever** | Primeiro SQL (`products`, `distributors` por UF, `internal_contacts`), depois vetor (`match_chunks`, top-8). Sempre com `brand_id` da sessão | contexto |
| 3 | **Redator** | Escreve como a marca fala, com dica/receita/link quando cabe, sem inventar dados. Se falta região → pede a cidade de forma natural | rascunho |
| 4 | **Guardião** | Tom de voz **e** segurança: sem claim de saúde, sem orientação nutricional individual, alérgenos só do cadastro, nada de álcool p/ menores, sem preço/prazo prometido, sem dado pessoal, sem código inventado. Veredito: `aprovada` / `reescrita` (máx. 2 ciclos) / `escalar` | resposta + veredito |

UI: **Copiar** · **Regerar** · 👍 · 👎 · **Encaminhar para** (comercial / técnico / SAC).

---

## 6. Papéis e telas

| Tela | admin | brand_manager | operator |
|---|---|---|---|
| Seletor de marca | todas | só as suas | só as suas |
| Configuração da marca | ✔ | ✔ | — |
| Aprendizado | ✔ | ✔ | leitura |
| Responder | ✔ | ✔ | ✔ |
| BI | ✔ | ✔ (sua marca) | — |

---

## 7. Melhorias de fluxo

1. **Aprendizado por feedback:** 👍 vira few-shot da marca (`golden_responses`).
2. **Biblioteca de receitas/dicas** por marca alimentada pelo marketing.
3. **Colagem em bloco:** thread inteiro; o Classificador separa turnos.
4. **Histórico só dentro da sessão:** sem identificação de contato não há histórico entre conversas.
5. **Fila e status** por conversa.
6. **Lacunas de base como métrica** (`knowledge_gaps`).
7. **LGPD:** só teor anonimizado; definir retenção e base legal. Alinhar com **WebOps/ICT e DPO da Kerry** antes de subir para produção.
8. **Fase 2 = webhooks da Meta.**

---

## 8. API da Meta

Instagram DMs e Messenger usam o Messenger Platform: webhook na chegada da mensagem, leitura pelo Graph API, resposta pela API dentro de 24 h (7 dias com tag *human agent*). Comentários têm endpoints próprios. WhatsApp é outra API (Cloud API). Requer Business Verification + App Review (semanas) e caminho de escalação humana obrigatório — o desenho human-in-the-loop já atende. Manter os dois modos (colar e webhook).

---

## 9. Sprints

| Sprint | Entrega |
|---|---|
| 1 ✔ | Shell + Auth + brands/memberships + RLS + teste de isolamento |
| 2 | Aprendizado: upload, ingestão, importador de distribuidores e produtos |
| 3 | Responder: Scrubber → Classificador → Retriever → Redator → Guardião |
| 4 | Encaminhamento + BI + golden_responses |
| 5 | SIBER + App Review na Meta |
| 6 | Webhooks Meta human-in-the-loop |
