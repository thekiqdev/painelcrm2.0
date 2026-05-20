# Backlog v1.1.4.7 → v1.1.4.13 — atualizações desde a release 4.6

Documento para **publicação de novidades** (changelog interno / comunicação com clientes).  
**Base de referência:** [BACKLOG_V1_1_4_6.md](./BACKLOG_V1_1_4_6.md) — o que lá está descrito **já faz parte da fundação** entregue na 4.6 (chat mobile em contexto, floating chat, Kanban realtime, `client_message_id`, etc.).

**Este ficheiro** consolida apenas o **delta** entre `deploy-v1.1.4.6` e `deploy-v1.1.4.13` (branch atual).

---

## Comparativo com o backlog 4.6

| Tema no backlog 4.6 | Situação | Evolução nas versões 4.7–4.13 |
|---------------------|----------|--------------------------------|
| Chat mobile em contexto / overlay | ✅ Mantido | Agendamento de mensagens, UX lead/cliente, filtros sidebar (tags + atendimento), ticket público no chat |
| Floating Chat (persistência F5) | ✅ Mantido | `lazyWithReload` após deploy; avatar fallback; recache automático de avatar WhatsApp |
| Kanban chat (cartões, drag, realtime) | ✅ Mantido | Padronização visual/comportamental alinhada a tarefas e projetos |
| `client_message_id` / idempotência | ✅ Mantido | — |
| Backend Kanban + attach | ✅ Mantido | Webhook UazAPI v2, reconciliação, exclusão total de instância |
| Estilos / AppLayout | ✅ Evoluído | Menu lateral reordenado; settings mobile hub; landing separada |

---

## v1.1.4.7 — Landing, dashboard e WhatsApp oficial

- **Landing comercial** separada do CRM (`vite.landing.config.ts`, build dedicado).
- **Dashboard**: ticket médio com agregado de faturas pagas; funil alinhado a contas a pagar.
- **WhatsApp oficial (Meta)**: conexões, fluxos super admin e migrações associadas.
- **Checkout / planos**: normalização telefone BR; landing com contas a pagar e planos; um plano pré-selecionado no checkout.
- **Super Admin**: conexões e migrações do módulo.

---

## v1.1.4.8 — Webhook UazAPI, Drive e mídia

- **Webhook UazAPI v2**: URL por `instanceId` + token; repair; modo legacy opcional; sufixos (`/messages/text`) via router.
- **Reconciliação WhatsApp**: multi-round, self-heal, diagnóstico; secret reconciliado; resolução de instância case-insensitive.
- **Instâncias**: exclusão total; herança desligada por defeito.
- **Google Drive (cliente)**: explorador, drag-drop para mover, exclusão, pastas de utilizador, upload otimista com progresso XHR, seletor direto.
- **Mídia / avatar**: catálogo com assinatura; migração `purpose`; unread-count rápido; recache automático ao abrir/sync conversa; script `repair_broken_avatar_cache`.
- **Super Admin**: diagnóstico de mídia, storage-diagnostics, auditoria OAuth Google, guia Fix/Diagnóstico.
- **SPA**: recarregar após falha de chunk lazy (sessão antiga vs deploy novo).

---

## v1.1.4.9 — Configurações mobile

- **Settings hub mobile**: rotas `/settings/:slug`; desktop mantém sidebar clássica.

---

## v1.1.4.10 — Chat, permissões e utilizadores

- **Chat ↔ CRM**: UX melhorada para abrir conversa a partir de lead e cliente.
- **Agendamento de mensagens** no compositor do chat.
- **Permissões granulares** e gestão de utilizadores (nome visível no chat).
- **Melhorias mobile** transversais ao CRM.
- **Realtime**: Socket.IO com **polling primeiro** atrás de proxy (fiabilidade em produção).

---

## v1.1.4.11 — Suporte público, projetos e financeiro

### Suporte e chamados

- **Portal de suporte público** por tenant (slug); lookup por protocolo.
- **Perfil do cliente**: separador de chamados (`ClientProfileTicketsTab`).
- **Notificações** de ticket (`ticketNotificationsService`).
- **WhatsApp** no cadastro do cliente (`clients_whatsapp`).

### Projetos (versões e operação)

- **Controlo de versões** de projeto (criar, publicar, duplicar, barra de versões, painel de controlo).
- **Tarefas**: copiar/mover entre projetos; integração com versões.
- **Financeiro do projeto**: ligação a transações, despesas, estado pago corrigido.
- **Drive no projeto** (`ProjectDriveWorkspace`).
- **Áreas do projeto** e wizard evoluídos.

### Plataforma

- **Chat da plataforma** para super admin.
- **E-mail transacional**, SMTP e **suporte da plataforma** (tickets plataforma ↔ tenant).
- **Meta Pixel**, atribuição e página de conversão; cadastro direto → `/signup-success`.

### Performance

- Landing estática separada; **lazy load** de layouts (`AppLayout`, `Settings`, Super Admin).

---

## v1.1.4.12 — Faturação, notificações, tarefas e acesso

- **Faturas**: controlos de estado, retry de pagamento, confirmação manual de pagamento.
- **Centro de notificações**: fiabilidade (entrega/leitura consistente).
- **Tarefas e projetos**: Kanban padronizado (mesma linguagem visual/comportamental).
- **Chamados**: melhorias de acesso tenant + super admin.
- **Chat**: **acesso público a ticket** via link (fluxo cliente/externo no chat).

---

## v1.1.4.13 — Projetos, menu, suporte plataforma e filtros do chat

### Projetos

- **Visualização em lista** no módulo Projetos (além de Grade e Kanban).
- Toggle **Grade | Lista | Kanban** com preferência em `localStorage` (`projects_view_type`).
- Tabela desktop + cards mobile; paginação client-side; links contextuais para cliente.

### Menu lateral (AppLayout)

- Ordem ajustada: **Faturamento → Documentação → Projetos → Vendas → Loja online → Financeiro**.

### Suporte da plataforma — notificações ao tenant

- Eventos: ticket criado, resposta pública, alteração de estado.
- Canais: in-app + e-mail + WhatsApp (reutiliza infraestrutura existente).
- Migração `247_platform_support_ticket_notifications` (init + Supabase).

### Chat — filtros da sidebar (`/chat`)

- **Barra unificada**: Fila | Minhas | tags visíveis | botão **+** (overflow).
- **Tags Kanban** como filtro client-side com contadores; catálogo carrega ao entrar no chat.
- Removido filtro duplicado **Não atribuídas** (lógica coberta por **Fila**).
- **Todas**, **Encerradas** e **Equipe** no menu **+**.
- **UX**: sidebar largura fixa 400px; tag e filtro de atendimento **mutuamente exclusivos** (ao mudar um, limpa o outro).
- Componentes: `ChatSidebarTagFilters`, `useChatTagFilters`; correção JSX do popover de filtros avançados.

---

## Outras melhorias transversais (várias versões)

- **Permissões granulares**, tarefas unificadas, cache React Query.
- **Busca global**: ícone UserPlus, a11y no CommandDialog, AbortError silenciado na API.
- **Upload API**: XHR aceita qualquer 2xx (ex.: 201 Created).
- **Chat UI**: `attendance_status` default + sync upsert.
- **Atendimento**: contadores de fila incluem não atribuídas na UI de **Fila**.

---

## Base de dados e migrações (resumo)

Correr `migrate` / Supabase **antes** de promover cada versão. Principais blocos novos desde 4.6:

| Versão | Exemplos de migrações / init |
|--------|------------------------------|
| 4.8+ | Drive, media purpose, attendance |
| 4.11 | `233–240` projetos/versões, portal suporte, WhatsApp cliente |
| 4.13 | `247_platform_support_ticket_notifications` |

*(Lista completa em `database/init/` e `supabase/migrations/` no intervalo de commits.)*

---

## Mapa de deploys (referência Git)

| Tag / branch | Commit destacado | Resumo |
|--------------|-----------------|--------|
| `deploy-v1.1.4.7` | `8f6f910` | Landing, dashboard, WhatsApp oficial |
| `deploy-v1.1.4.8` | `307b8b5` | UazAPI, Drive, mídia, avatar |
| `deploy-v1.1.4.9` | `3c93a5b` | Settings mobile hub |
| `deploy-v1.1.4.10` | `4aecdf9` | Chat lead/client, agendamento, permissões |
| `deploy-v1.1.4.11` | `0f27b44` | Portal suporte, versões projeto, plataforma |
| `deploy-v1.1.4.12` | `5e592df` … `ff6527b` | Faturas, notificações, kanban, ticket público |
| `deploy-v1.1.4.13` | `14a75c1`, `e796edf` | Lista projetos, menu, notif. plataforma, filtros chat |

---

## Sugestão de texto curto para “Atualizações” (copy-paste)

**Título sugerido:** Novidades v1.1.4.7 a v1.1.4.13

**Bullets para clientes (prioridade alta):**

1. **Projetos** — nova vista em **lista**, controlo de **versões**, financeiro e drive integrados.  
2. **Suporte** — **portal público** por link/slug; chamados no perfil do cliente; notificações quando a plataforma responde ao seu ticket.  
3. **Chat** — filtros por **tag** e atendimento (Fila, Minhas) numa barra compacta; melhorias de WhatsApp (webhook, avatares, instâncias).  
4. **Financeiro** — faturas com retry, confirmação manual e estados mais claros.  
5. **Configurações** — hub mobile; permissões e nomes no chat.  
6. **Marketing** — Meta Pixel e fluxo de cadastro com página de sucesso.

**Validação recomendada antes de anunciar:**

- Mobile: settings, chat overlay, portal suporte público.  
- Desktop: projetos (lista/kanban), filtros `/chat`, floating chat após F5.  
- Migrações aplicadas; `.env` fora do repositório.

---

## Notas de release

- Branch atual: **`deploy-v1.1.4.13`**.  
- O backlog **4.6** não deve ser repetido nas comunicações — referenciar apenas como base já entregue.  
- Ajustar bullets consoante o que for **efetivamente promovido** em cada ambiente (staging/produção).

---

*Gerado a partir do histórico Git `deploy-v1.1.4.6..deploy-v1.1.4.13`. Atualize este ficheiro ao fechar a próxima release (`v1.1.4.14+`).*
