# Backlog v1.1.4.6 — recursos e melhorias

Documento de referência do que entra nesta release (funcionalidades novas, melhorias e fundação técnica). Ajuste os itens consoante o que for efetivamente promovido para produção.

---

## Chat — mobile em contexto (sem sair da página)

- **Overlay full-screen no mobile** (`MobileConversationOverlay`): ao abrir conversa a partir de clientes, leads, Kanban ou notificações, a conversa abre por cima da página atual em viewport &lt; `md`, sem `navigate('/chat?…')`.
- **API no provider** (`FloatingChatProvider`): `openConversationInContext`, `openChatForClient`, `openChatForLead`, `closeMobileConversationOverlay`; no desktop mantém janelas flutuantes.
- **Histórico / voltar**: `pushState` para o botão voltar do browser fechar o overlay; Escape e botão fechar alinhados.
- **Resolução CRM → conversa**: `resolveChatConversationForCrm.ts` (espelha `/chat?openClientId=` / `openLeadId=`).
- **Integrações na UI**: lista mobile de clientes, leads (`LeadMobileCardList`), Kanban (`ChatKanbanPage`), sininho (`HeaderNotificationBell` — parse de `href` para `/chat` no mobile), perfil do cliente (atalho “Conversa WhatsApp” no mobile), busca mobile de clientes (`MobileClientsSearchSheet`), cabeçalho global (`AppLayout`).

---

## Chat — Floating Chat (fiabilidade e arquitetura)

- **Persistência após F5**: validação pós-login só remove conversas quando a API devolve **404** (`probeFloatingChatConversationPersist`); erros transitórios (rede, 5xx, etc.) **mantêm** os painéis; espera `!authLoading` antes de validar.
- **Gravação síncrona antes de fechar**: listeners `beforeunload` e `pagehide` fazem flush do estado para `localStorage` (evita perder o debounce de 160 ms ao recarregar).
- **Correção de contexto React**: `floatingChatContext.tsx` extrai `FloatingChatContext` e hooks para **eliminar dependência circular** `FloatingChatProvider` ↔ `MobileConversationOverlay` (evita “useFloatingChat must be used within FloatingChatProvider” em runtime).

---

## Chat — Kanban (cartões, realtime, arrastar)

- **Realtime nos cartões**: hook `useKanbanBoardRealtimeCards` — atualização via eventos de janela, pulse breve em mensagem recebida, integração com bridge de não lidos (`kanbanConversationUnreadBridge`).
- **Drag / preview**: biblioteca de preview de arrasto (`conversationDragPreview*`, `chatKanbanConversationDrag`, componente `ConversationDragPreview`) e ajustes em cartões/colunas/dialogs do quadro.
- **Fila de envio partilhada**: `useChatOutboundQueue` alinhada ao floating overlay e ao motor existente (sem segundo motor de chat).
- **Componentes Kanban**: evoluções em `ChatKanbanCard`, `ChatKanbanBoardColumn`, `ChatKanbanSortableCard`, `ChatKanbanConversationDrawer`, `ChatKanbanConversationPicker`, `ChatKanbanAddCardDialog`.

---

## Backend — mensagens, Kanban e API

- **`client_message_id`**: coluna UUID em `chat_messages` com índice único por conversa (idempotência / retries de envio no cliente); migração em `database/init/` e `supabase/migrations/`.
- **Kanban**: rotas e controller (`chatKanbanController`, `chatKanbanRoutes`), automação de colunas (`kanbanColumnAutomationService`), endpoint dedicado **`POST /api/kanban/attach-conversation`** (`kanbanAttachRoutes`) para associar conversa ao quadro.
- **Chat**: alterações em `chatController`, `index.ts`, `migrate.ts` conforme diff do branch.

---

## Frontend — serviços e página Chat

- **`chat.ts`**: `probeFloatingChatConversationPersist` e integrações com o fluxo acima.
- **`chatKanban.ts`**, **`Chat.tsx`**, **`MessageStatusIndicator`**: melhorias alinhadas ao Kanban e ao estado de mensagens.

---

## Estilos e layout

- **`index.css`**: ajustes globais eventualmente necessários ao overlay / floating shell.
- **`AppLayout`**: integração com floating chat e pesquisa global com contexto.

---

## Base de dados e migrações

- `196_chat_messages_client_message_id.sql` (init) e `supabase/migrations/20260530120000_chat_messages_client_message_id.sql`.

---

## Notas de release

- Confirmar que **`.env` não é commitado** em deploy (credenciais e URLs sensíveis).
- Correr migrações (`migrate` / Supabase) antes do deploy.
- Validar em **mobile** (&lt; 768px): clientes, leads, Kanban, notificações e voltar do browser; em **desktop**: floating chat e persistência após F5.

---

*Branch `deploy-v1.1.4.6`. Atualize este ficheiro se cortar ou adiar funcionalidades para uma versão posterior.*
