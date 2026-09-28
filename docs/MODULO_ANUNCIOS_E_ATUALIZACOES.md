# Módulo Anúncios e Atualizações

## Objetivo

Permitir que o **Super Admin** publique comunicados para clientes (tenants), com envio opcional via **WhatsApp** (fila com atraso entre mensagens) e, quando aplicável, exibição numa **página de atualizações** acessível aos utilizadores do tenant. Inclui **grupos de clientes** para segmentação e **histórico de envios** por destinatário.

## Tipos de anúncio

| Tipo | Comportamento |
|------|----------------|
| `whatsapp_only` | Mensagem apenas para WhatsApp; histórico de envio mantido; não aparece na página de atualizações. |
| `whatsapp_and_updates_page` | Mensagem WhatsApp + entrada na lista pública/interna de novidades (após **publicar**). |

**Estados:** `draft`, `published`, `unpublished`. A página de atualizações lista apenas anúncios **publicados** do tipo `whatsapp_and_updates_page`.

## Grupos de clientes

- Criados em **Super Admin > Anúncios > Grupos** (`/superadmin/announcements/groups`).
- Campos: nome, descrição, ativo/inativo, membros (vários `tenant_id`).
- Um tenant pode pertencer a vários grupos.
- **Visibilidade na página Atualizações:** campo `visibility_group_id` no anúncio. `NULL` = visível a todos os tenants com acesso à API de atualizações; se preenchido, só tenants membros desse grupo veem o item (super admin vê todos).

## Envio via WhatsApp

- **Super Admin** inicia envio em **Enviar** (`POST /api/superadmin/announcements/:id/send`).
- Parâmetros: `group_id`, `delay_seconds` (0–3600), `scheduled_start_at` opcional.
- Destinatários: membros únicos do grupo (sem duplicar tenant no mesmo envio).
- **Fila:** registos em `announcement_send_recipients` com `scheduled_at` escalonado; worker em background processa `pending` quando `scheduled_at <= now()`.
- **Estados por destinatário:** `pending`, `sent`, `failed`, `skipped` (ex.: telefone ausente ou inválido).
- Integração: reutiliza a instância WhatsApp da **plataforma** (como outras notificações). Se não estiver configurada, destinatários podem ficar `failed` com mensagem de erro clara.

## Página de atualizações

- **Rotas frontend:** `/updates` (listagem) e `/updates/:id` (detalhe). Componentes: `src/pages/UpdatesPage.tsx`, `src/pages/UpdateDetailPage.tsx`; serviço `src/services/announcementsUpdates.ts`.
- **API tenant:** ver secção *API tenant* abaixo.
- Menu: **foto de perfil > Atualizações** (desktop); em mobile, **Mais > Conta e sistema > Atualizações**.

### Layout da listagem (`/updates`)

- **Largura:** conteúdo centrado com `max-width` ~1200px; padding lateral confortável.
- **Cabeçalho:** título **Atualizações**, subtítulo *Novidades, melhorias e avisos importantes da plataforma.* À direita (ou empilhado no mobile): **busca por título** (filtro local sobre a lista já carregada) e **select de categoria** (Todas, Novidades, Melhorias, Correções, Avisos) — a categoria dispara novo `GET` com query `category`.
- **Destaque:** se existir item com `featured === true`, o mais recente entre os resultados filtrados aparece como **card hero** (maior, opcionalmente com `banner_url` em desktop).
- **Grelha:** restantes itens em **2 colunas** no desktop e **1 coluna** no mobile.
- **Cada card:** ícone por categoria (foguete / tendência / ferramenta / alerta), badge de categoria, título, resumo (`page_summary`), data, badge **Novo** se não lido, link **Ver detalhes**; hover suave no desktop.
- **Estado vazio:** mensagem *Nenhuma atualização disponível* e texto explicativo (sem itens da API ou lista vazia após busca).

### Layout do detalhe (`/updates/:id`)

- **Largura do artigo:** ~760–880px centrado (`max-w` ~880px), card com padding generoso.
- **Topo:** botão **Voltar** (sticky no mobile sob o header da app); no artigo: badge(s), título grande, data de publicação, resumo se existir, `banner_url` opcional.
- **Corpo:** texto plano ou **HTML** sanitizado (`src/utils/announcementRichText.ts`) com classes **prose** (tipografia changelog: parágrafos, listas, links, imagens, tabelas básicas).
- **Rodapé:** **Voltar para atualizações** e card opcional *Continue a acompanhar as novidades* com atalho para a lista.

### Não lidas e badge «Novo»

- A lista inclui o campo `read` por utilizador (exceto **super admin**, que vê sempre como lido).
- **Badge «Novo»** = `read === false` (não depende da data de publicação).
- **Não** se marca tudo como lido só por abrir a listagem: o utilizador mantém não lidas até abrir o detalhe (ou marcar leitura por outro fluxo, ex. sininho).
- **Ao abrir o detalhe** (`/updates/:id`): `POST /api/announcements/updates/mark-read` com `announcement_ids: [id]`; em seguida `painelcrm:notifications-refresh` para atualizar contagens no **sininho** e no atalho **Atualizações** no menu.
- Opcionalmente pode usar `POST mark-read` sem IDs para marcar **todas** as atualizações visíveis (ex.: futuro botão «marcar todas como lidas»); o comportamento atual da UI não chama isso ao entrar na lista.

## Sininho (notificações in-app)

Reutiliza a tabela **`notifications`** e a API **`/api/notifications`** já existentes no CRM (motor distinto do WhatsApp / `platform_notification_deliveries`).

### Ao publicar um anúncio (`POST /api/superadmin/announcements/:id/publish`)

- Se o anúncio for do tipo **`whatsapp_and_updates_page`** e estiver **publicado**, o backend cria uma notificação por **utilizador** elegível:
  - Utilizadores com `tenant_id` preenchido e **não** super admin.
  - Respeita **`visibility_group_id`**: `NULL` = todos os tenants; caso contrário só utilizadores cujo `tenant_id` está em `announcement_group_members` para esse grupo.
- **Idempotência:** não volta a inserir se já existir linha com `entity_type = 'announcement'`, `entity_id = <announcement_id>` e o mesmo `user_id` (índice único parcial). Republicar o mesmo anúncio não duplica notificações.
- Campos típicos: `type = 'announcement'`, `title` tipo `Nova atualização: …`, `message` = resumo da página ou texto padrão, `href = /updates/<id>`, `entity_type`, `entity_id`, `tenant_id` do destinatário.

### Leitura cruzada anúncio ↔ notificação

- **`POST /api/announcements/updates/mark-read`** grava `announcement_reads` e marca como lidas as notificações `announcement` correspondentes ao utilizador.
- **`PATCH /api/notifications/:id/read`** marca a notificação como lida e, se for `announcement` e existir `tenant_id` na sessão, grava também `announcement_reads`.

### Endpoints utilizados pelo frontend

| Método | Caminho | Uso |
|--------|---------|-----|
| GET | `/api/notifications` | Lista do sininho |
| GET | `/api/notifications/unread-count` | Badge do sininho |
| PATCH | `/api/notifications/:id/read` | Item lido (ao clicar) |
| PATCH | `/api/notifications/read-all` | Marcar todas lidas |
| GET | `/api/announcements/updates/unread-count` | Badge em **Atualizações** (perfil / mobile) |
| POST | `/api/announcements/updates/mark-read` | Corpo opcional `{ "announcement_ids": ["uuid", ...] }`; omitir IDs = todas as visíveis |

O evento `window` **`painelcrm:notifications-refresh`** (disparado após marcar leituras) pede ao header/mobile que atualize contagens.

### Migração de esquema

- `database/init/156_notifications_announcement_entity.sql` — colunas `tenant_id`, `href`, `entity_type`, `entity_id` em `notifications`; `title` como `TEXT`; índice único parcial para anúncios.

## Histórico

- **Envios:** `announcement_sends` (lote: anúncio, grupo, delay, agendamento, estado global).
- **Destinatários:** `announcement_send_recipients` (tenant, telefone, tentativas, erro, datas).
- Listagem Super Admin: `GET /api/superadmin/announcements/sends` e `GET /api/superadmin/announcements/sends/:sendId`.

## Leituras

A tabela **`announcement_reads`** regista **`announcement_id`**, **`tenant_id`**, **`user_id`** e **`read_at`**, com unicidade `(announcement_id, user_id)`. Alimenta o estado “não lido” na lista de atualizações e sincroniza com o sininho conforme descrito acima.

## Tabelas (resumo)

| Tabela | Função |
|--------|--------|
| `announcement_groups` | Grupos nomeados de tenants. |
| `announcement_group_members` | N:N grupo ↔ tenant. |
| `announcements` | Conteúdo do anúncio, tipo, estado, visibilidade, campos de página. |
| `announcement_sends` | Cada operação de envio (lote). |
| `announcement_send_recipients` | Fila/histórico por tenant/telefone. |
| `announcement_reads` | Leitura por utilizador (tenant-scoped). |
| `notifications` | Notificações in-app (inclui tipo `announcement` com `href` / `entity_id`). |

Script de criação base: `database/init/154_announcements_module.sql`.  
Extensão sininho: `database/init/156_notifications_announcement_entity.sql`.

## Rotas API

### Super Admin (`/api/superadmin/announcements`)

| Método | Caminho |
|--------|---------|
| GET | `/` — listar anúncios |
| POST | `/` — criar |
| GET | `/:id` |
| PATCH | `/:id` |
| POST | `/:id/publish` |
| POST | `/:id/unpublish` |
| POST | `/:id/send` |
| GET | `/sends` |
| GET | `/sends/:sendId` |
| GET | `/groups` |
| POST | `/groups` |
| PATCH | `/groups/:id` |
| GET | `/groups/:id/members` |
| PUT | `/groups/:id/members` |

### Tenant / utilizador autenticado

| Método | Caminho |
|--------|---------|
| GET | `/api/announcements/updates` |
| GET | `/api/announcements/updates/unread-count` |
| POST | `/api/announcements/updates/mark-read` |
| GET | `/api/announcements/updates/:id` |

## Variáveis de ambiente (backend)

- `ANNOUNCEMENTS_SEND_POLL_MS` — intervalo do processamento da fila (ms); padrão ~4000.

## Critérios de aceite

- Super Admin cria e edita anúncios e escolhe o tipo (`whatsapp_only` / `whatsapp_and_updates_page`).
- Super Admin cria grupos e associa tenants.
- Super Admin envia anúncio para um grupo com delay entre mensagens; sem duplicar tenant no mesmo envio; histórico persistido.
- Anúncio **publicado** do tipo página aparece em **Atualizações**; respeita `visibility_group_id`.
- Utilizadores acedem **Atualizações** pelo menu do perfil (e atalho mobile).
- **Publicar** gera notificação no **sininho** para utilizadores elegíveis; republicar não duplica.
- Badges de não lidas no sininho e em **Atualizações** refletem o estado real; marcar leitura sincroniza ambos.
- Tenants comuns não criam anúncios globais (rotas apenas super admin + leitura tenant).
- Build backend e frontend sem erros após integração.
