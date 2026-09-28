# Correção — Identidade, Sync e Última Mensagem no Chat

## 1. Problemas identificados

- **Nome/foto** inconsistentes: conversas só com número ou sem foto quando o provedor já tinha dados.
- **Botão “Sincronizar”** no header só disparava **sync de mensagens** (`/messages/sync`), sem atualizar nome/foto da conversa na UazAPI.
- **Última mensagem / ordenação**: mensagens enviadas **pelo WhatsApp no celular** (`fromMe` sem `wasSentByApi`) eram **ignoradas no webhook** junto com mensagens da API — o processamento retornava antes de `saveMessage`, logo **não atualizavam** `last_message_*` nem o histórico.
- **WebSocket** emitia `conversation_updated` com objeto **anterior** a `saveMessage`, com `last_message_*` desatualizados.
- **Sync de mensagens em lote** podia deixar `last_message_*` defasados se a ordem dos itens retornados não coincidisse com o último evento (mitigado com reconciliação ao final).

## 2. Causa real

| Área | Causa |
|------|--------|
| Webhook | Condição `wasSentByApi \|\| fromMe` descartava **todo** envio próprio, incluindo mensagens do **app WhatsApp no telefone** (que não são eco da API do painel). |
| Sync mensagens | Endpoint só chama `findMessages` + `saveMessage`; **não** chama `upsertConversation` (identidade). |
| Identidade | Depende de `upsertConversation` (webhook inbound, sync de conversas, ou novo endpoint dedicado). |
| UI | Um único ícone de refresh sem separar “mensagens” vs “dados do contato”. |
| WS | Emissão usava linha da conversa **antes** de `saveMessage` atualizar `last_message_*`. |

## 3. O que foi corrigido

1. **Webhook:** ignorar apenas `wasSentByApi` (eco da API). Mensagens `fromMe` **sem** `wasSentByApi` passam a ser persistidas e a atualizar a conversa.
2. **Webhook:** após `saveMessage`, **nova leitura** de `chat_conversations` antes de `emitConversationUpdate`, para refletir `last_message_at` / `last_message_preview` corretos.
3. **Webhook:** `external_message_id` inexistente passa a usar UUID gerado para não quebrar o insert.
4. **Sync de mensagens:** ao final, `reconcileConversationLastMessage` alinha `last_message_*` ao último registro em `chat_messages` (por `sent_at` / `created_at`).
5. **Novo endpoint:** `POST /api/chat/conversations/:id/refresh-identity` — chama UazAPI `findChats` com `wa_chatid` + `upsertConversation` (nome, foto, metadata), **sem** sincronizar mensagens.
6. **UI:** ícone de refresh virou **menu** com:
   - **Sincronizar mensagens** (comportamento anterior + `loadConversations` após sucesso);
   - **Atualizar dados do contato (WhatsApp)** (novo fluxo).

## 4. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `packages/backend/src/controllers/chatController.ts` | `reconcileConversationLastMessage`; `refreshConversationIdentity`; ajuste webhook; reconciliação em `syncConversationMessages` |
| `packages/backend/src/routes/chatRoutes.ts` | Rota `POST /conversations/:id/refresh-identity` |
| `src/services/chat.ts` | `refreshConversationIdentity` |
| `src/pages/Chat.tsx` | Menu sync + `handleRefreshConversationIdentity`; `loadConversations` após sync de mensagens |

## 5. Como funciona o sync agora

| Ação | Endpoint | Efeito |
|------|----------|--------|
| **Sincronizar mensagens** (menu) | `POST /api/chat/conversations/:id/messages/sync` | Busca mensagens remotas, grava via `saveMessage`, reconcilia `last_message_*`, recarrega lista no front. |
| **Atualizar dados do contato** (menu) | `POST /api/chat/conversations/:id/refresh-identity` | `findChats` filtrando `wa_chatid` → `upsertConversation` (nome, foto, metadata). **Não** importa histórico de mensagens. |
| **Sincronizar conversas** (instância / settings) | `POST /api/chat/conversations/sync` | Lista de chats + upsert em lote (já existia). |

## 6. Como a última mensagem é determinada agora

- Cada `saveMessage` continua aplicando as regras da **Fase A** (timestamp condicional, preview com `[Mídia]` quando aplicável).
- **Reconciliação** após sync de mensagens: `SELECT` da última linha em `chat_messages` (por `sent_at` / `created_at`) e `UPDATE` em `chat_conversations`.
- **Webhook** para mensagens próprias **não API**: fluxo completo `upsertConversation` → `saveMessage` → emissão com linha **atual** da conversa.

## 7. Como validar manualmente

1. **Cliente envia mensagem:** conferir preview, posição na lista e evento em tempo real.
2. **Operador envia pela plataforma:** como antes; webhook com `wasSentByApi` continua ignorado (sem duplicar).
3. **Operador envia pelo WhatsApp no celular:** histórico e `last_message_*` devem atualizar após webhook (não mais ignorado só por `fromMe`).
4. **Menu → Sincronizar mensagens:** histórico alinhado; lista recarregada.
5. **Menu → Atualizar dados do contato:** nome/foto/metadata da conversa quando a UazAPI retornar o chat.
6. **Conversa só com número:** após “Atualizar dados do contato”, se o provedor tiver nome/foto, devem aparecer.

## 8. Riscos remanescentes

- **Duplicação teórica:** se a UazAPI marcar mensagem da API com `fromMe` e **sem** `wasSentByApi`, o webhook poderia duplicar frente a `sendMessage`. Mitigação: `ON CONFLICT` em `chat_messages` pelo par `(conversation_id, external_message_id)`.
- **`refresh-identity`:** depende de `findChats` aceitar `wa_chatid` igual a `external_chat_id` armazenado; se o provedor usar formato diferente, pode retornar vazio (`reason: no_remote_chat`).
- **Performance:** uma query extra por mensagem no webhook para emitir conversa atualizada (aceitável frente à correção de UX).
