# Correção — Botão de Sincronizar do Chat

## 1. Problema identificado

- O ícone de sincronizar havia sido dividido em **menu com duas opções** (mensagens vs dados do contato), contrário ao desejado.
- A ação **Atualizar dados do contato** (`refresh-identity` → `upsertConversation`) falhava com **HTTP 500** e mensagem PostgreSQL: **`could not determine data type of parameter $7`**.

## 2. Causa do erro 500

No `UPDATE` de `upsertConversation`, o parâmetro **`$7`** corresponde a **`chatData.lastMessageAt`**.

Quando o provedor retorna chat **sem** timestamp de última mensagem (ou o normalizador produz `null`), o driver envia **`NULL`** sem tipo inferido. Em expressões como `WHEN $7 IS NULL` e `$7 >= last_message_at`, o PostgreSQL **não consegue inferir o tipo** do placeholder e falha com *could not determine data type of parameter $7*.

**Correção:** usar cast explícito **`$7::timestamptz`** (e `($7::timestamptz) IS NULL` onde aplicável) nos dois ramos do `UPDATE` (com e sem coluna `lead_id`).

O mesmo padrão foi aplicado a **`$3::timestamptz`** em `saveMessage` (e em `messageService.saveMessageToConversation`) para consistência quando houver ambiguidade.

## 3. O que foi corrigido

### Backend

- Cast explícito de `lastMessageAt` nos `UPDATE` de `upsertConversation` (`$7::timestamptz`).
- Cast explícito de `effectiveSentAt` nos `UPDATE` de última mensagem em `saveMessage` e `messageService` (`$3::timestamptz`).

### Frontend

- Removido o **DropdownMenu** com duas entradas.
- **Um único botão** (ícone) chama `handleSyncConversation`, que em sequência:
  1. `syncConversationMessages` (mensagens + reconciliação de última mensagem já existente no backend),
  2. `loadMessages`,
  3. `refreshConversationIdentity` (nome/foto/metadata via UazAPI + `upsertConversation`),
  4. `loadConversations` (lista alinhada),
  5. toast único: **“Conversa sincronizada”**.

## 4. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `packages/backend/src/controllers/chatController.ts` | Casts `$7::timestamptz` em `upsertConversation`; `$3::timestamptz` em `saveMessage` |
| `packages/backend/src/services/messageService.ts` | Casts `$3::timestamptz` no `UPDATE` da conversa |
| `src/pages/Chat.tsx` | `handleSyncConversation` unificado; UI com um só ícone |

## 5. Como o botão funciona agora

- **Um clique** no ícone de atualizar executa o fluxo completo: histórico remoto + identidade do contato + recarga da lista.
- Ordem: **mensagens → identidade → lista** (identidade após mensagens evita sobrescrever preview com dado só do catálogo de chats antes de reconciliar pelo histórico, quando ambos rodam no mesmo clique).

## 6. Como validar manualmente

1. Abrir uma conversa e clicar no ícone de sincronizar: **não** deve abrir submenu; deve girar o ícone e concluir sem 500.
2. Conferir novas mensagens e preview/ordenação.
3. Conferir nome/foto quando a UazAPI devolver dados.
4. Repetir em conversa onde antes falhava `refresh-identity` (sem erro `parameter $7`).

## 7. Riscos remanescentes

- **Carga:** um clique dispara duas chamadas à API (mensagens + chat/find). Aceitável para ação manual.
- **Provedor:** se `findChats` com `wa_chatid` não retornar o chat, identidade não atualiza (`reason: no_remote_chat`), mas mensagens continuam sincronizando.
