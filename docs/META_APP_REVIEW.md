# Listening — Dossiê para App Review (Meta) e TikTok Business Messaging

Produto: **Listening**, da TGT Studio. Modelo **Tech Provider**: um app da TGT; cada cliente (marca) conecta as próprias contas via login da Meta / TikTok.

## 0. Pré-requisitos (feitos por vocês)
- Business Manager da TGT Studio com **Business Verification** concluída (CNPJ, contrato social ou cartão CNPJ, domínio `tgtstudio.com.br` verificado).
- App criado em developers.facebook.com, tipo **Business**, com produtos *Facebook Login for Business*, *Messenger* e *Instagram* adicionados.
- URLs obrigatórias (já publicadas):
  - Política de privacidade: `https://brands-eta-one.vercel.app/privacidade` (trocar pelo domínio final, ex. `listening.tgtstudio.com.br/privacidade`)
  - Termos: `https://brands-eta-one.vercel.app/termos`
  - Exclusão de dados: instruções na seção 8 da política (e-mail `contato@tgtstudio.com.br`, assunto "Exclusão de dados")
- Callback OAuth: `https://<dominio>/api/meta/callback` · Webhook: `https://<dominio>/api/meta/webhook`
- Contas de teste: o IG/FB da própria TGT como administrador do app (funciona antes do review).

## 1. Permissões e justificativa (colar no formulário)

| Permissão | Justificativa (uso) |
|---|---|
| `pages_manage_metadata` | Assinar webhooks da Página para receber mensagens e comentários em tempo real. |
| `pages_messaging` | Receber mensagens do Messenger e enviar as respostas aprovadas pelo operador da marca. |
| `pages_read_engagement` | Ler comentários públicos em publicações da Página para que a marca possa respondê-los. |
| `pages_manage_engagement` | Publicar respostas a comentários aprovadas pelo operador. |
| `instagram_basic` | Identificar a conta profissional do Instagram vinculada à Página conectada. |
| `instagram_manage_messages` | Receber mensagens diretas do Instagram e enviar as respostas aprovadas pelo operador. |
| `instagram_manage_comments` | Ler e responder comentários em publicações do Instagram. |
| `business_management` | Listar as Páginas/contas do Business Manager do cliente para que ele escolha o que conectar. |
| `Human Agent` (recurso) | Permitir resposta humana em até 7 dias quando a conversa exige apuração interna. |

## 2. Descrição do caso de uso (texto sugerido)

> Listening é uma ferramenta de atendimento usada por equipes de marketing de marcas de alimentação (food service) no Brasil. Quando um consumidor ou cliente envia uma mensagem direta ou comenta uma publicação da marca, o Listening recebe o evento via webhook, sugere uma resposta com base no catálogo de produtos e materiais da própria marca, e a apresenta a um operador humano, que revisa e aprova o envio. A resposta é enviada pela API na mesma conversa. Dados pessoais são anonimizados antes de qualquer armazenamento; a ferramenta não constrói perfis nem usa os dados para outros fins. Para categorias de baixo risco (agradecimentos, boas-vindas), a marca pode optar por envio automático, sempre com identificação de atendimento automatizado e opção de falar com uma pessoa.

## 3. Roteiro do vídeo (2–3 min, tela gravada)
1. Login no Listening; mostrar seletor de marca (barra muda de cor).
2. Configuração → **Conectar canais** → login da Meta → escolher Página e conta IG → status "ativo".
3. Em outra janela, enviar uma DM para o IG de teste ("oi, vocês têm molho pra hambúrguer? sou de Goiânia").
4. Voltar ao Listening: atendimento aparece na lista com "aguardando aprovação" e a resposta sugerida.
5. Operador lê, edita uma palavra, clica **Enviar**. Mostrar a mensagem chegando no IG.
6. Abrir "O que a resposta usou" (fontes) e o contador "dados pessoais fora do banco".
7. Configuração → desconectar canal → explicar que dados do canal são eliminados.

## 4. TikTok Business Messaging
- App em business-api.tiktok.com (TikTok for Business), produto *Business Messaging API*.
- Contas de clientes precisam ser **TikTok Business Account** (disponível fora de EUA/EEE/UK/Suíça — Brasil ok).
- Regras: conversa sempre iniciada pelo usuário; janela de **48 h** após a última interação.
- Webhook: `https://<dominio>/api/tiktok/webhook`.

## 5. WhatsApp (se entrar)
- WhatsApp Business Cloud API via o mesmo app da Meta; um número por marca (WABA).
- Janela de 24 h; fora dela só com *template* aprovado. Conversas cobradas por categoria.

## 6. O que a plataforma já cumpre (argumentos para o review e para clientes)
- Isolamento por marca no banco (RLS) com teste automatizado.
- Anonimização antes de gravar; sem tabela de contatos; identificadores das plataformas descartados ao fim do atendimento.
- Revisão humana por padrão; automação opt-in por categoria; identificação de atendimento automatizado.
- Retenção configurável por cliente (padrão 12 meses) e exclusão ao desconectar canal (≤ 30 dias).
