# Fase 1 — Relatório: Grupos e comunidades UAZAPI no Chat PainelCRM

**Data:** 2026-05-06  
**Objetivo:** Mapear o estado actual antes de implementar o plano completo (grupos/comunidades no chat integrado).

**Referência API:** [UAZAPI — Grupos e Comunidades](https://docs.uazapi.com/tag/Grupos%20e%20Comunidades) — 19 endpoints (listar grupos GET/POST, criar grupo, info por convite, entrar/sair, participantes, permissões, comunidade, etc.).

---

## 1. Como o sistema identifica conversas hoje

| Conceito | Onde / como |
|----------|-------------|
| **Chave externa principal** | `chat_conversations.external_chat_id` — texto; para WhatsApp costuma ser JID (`…@s.whatsapp.net`, `…@lid`, **`…@g.us`** para grupos). |
| **Identidade canónica** | Colunas `canonical_chat_id`, `identity_state`, etc. (evolução em `canonicalConversationIdentity.ts`, `uazapiIdentityResolve.ts`). |
| **Provedor** | `provider` / `provider_conversation_id` (multicanal, `database/init/182_chat_engine_multichannel_phase4.sql`). |
| **Unicidade** | `UNIQUE(instance_id, external_chat_id)` na conversa UazAPI. |

---

## 2. Diferenciação individual vs grupo no código

| Mecanismo | Detalhe |
|-----------|---------|
| **Sufixo JID** | `classifyWhatsAppJid` / `classifyChatRowForLog`: `jid.endsWith('@g.us')` ⇒ **group**. |
| **Flag UAZAPI** | `wa_isGroup === true` nas linhas de `POST /chat/find`. |
| **Resolução `/message/find`** | `resolveMessageFindChatId`: para `@g.us` usa `provider_group_jid` com o próprio JID do grupo. |

**Comunidades (WhatsApp):** no código **não** há tipo distinto; grupos “de comunidade” provavelmente chegam como `@g.us` ou metadados específicos na UAZAPI — **confirmar payloads reais** na doc OpenAPI UAZAPI e em respostas de “Listar grupos” / “Gerenciar grupos em uma comunidade”.

---

## 3. O que já suporta grupo hoje

| Área | Suporte |
|------|---------|
| **Classificação / JID** | Sim — utilitários reconhecem `@g.us` e `wa_isGroup`. |
| **`upsertConversation` + webhook** | Em teoria aceita qualquer `externalChatId` normalizado; mensagens de grupo recebidas por webhook podem **criar/atualizar** linha de conversa se o fluxo de extração do `chatId` for `@g.us`. |
| **`sendMessage` (UazAPI)** | Usa `conversation.external_chat_id` / canónico no payload para `/send/text` — **provavelmente funciona** para JID de grupo se a API aceitar o mesmo contrato que 1:1 (validar na doc UAZAPI). |
| **Listagem `getConversations`** | **Não** filtra explicitamente `@g.us` no SQL principal — se existir conversa de grupo na BD, **pode aparecer** na lista. |
| **Sincronização de lista (`performSyncConversationsForInstance`)** | **Não** — grupos são **excluídos de propósito** antes do upsert (ver §4). |

---

## 4. O que quebra ou impede grupos “de primeira classe”

### 4.1 Sync de conversas ignora grupos

Em `chatController.ts`, `performSyncConversationsForInstance`:

- Comentário explícito: *«Sincronizamos apenas chats não-grupo: não chamamos `wa_isGroup: true` (evita poluir CRM com grupos).»*
- Chamadas usam `wa_isGroup: false` ou suplemento `wa_chatid: '!~@g.us'`.
- **Antes do upsert:** `chatsArray = ...filter(row => classifyChatRowForLog(row) !== 'group')` — **remove todas as linhas classificadas como grupo**, mesmo que a API as devolvesse.

**Efeito:** grupos **não** entram no PainelCRM via sync normal; só por webhook (mensagem recebida) ou dados já existentes / inserção manual.

### 4.2 Bug / inconsistência: ramo `explicitWaIsGroup`

Se o cliente enviar `filters.wa_isGroup`, o código ainda aplica:

`extractChatsArrayFromFindResponse(...).filter(row => classifyChatRowForLog(row) !== 'group')`

Ou seja, **mesmo pedindo grupos à API, o backend descarta grupos** nesse ramo. Correcção futura obrigatória quando existir listagem dedicada de grupos.

### 4.3 Bootstrap e batch de mensagens excluem grupos

- `runBatchMessageSyncForRecentConversations`: SQL com `c.external_chat_id NOT LIKE '%@g.us'`.
- Bootstrap pós-sync: mesma exclusão ao escolher conversas para `/message/find`.
- `batchHydrateIdentitiesAfterChatListSync`: ignora JIDs que terminam em `@g.us`.

**Efeito:** histórico de grupo **não** é preenchido automaticamente como nas conversas 1:1.

### 4.4 Modelo de dados

- **`chat_conversations`:** não há `conversation_type` (`direct` | `group` | `community`). Inferência apenas por `external_chat_id LIKE '%@g.us'` ou `metadata`.
- **`client_id` / `lead_id`:** pensados para 1:1; grupos não devem auto-vincular CRM sem regra explícita (alinhado ao “Não fazer” do plano).
- **`communication_contacts`:** `upsertCommunicationContactFromNormalized` usa telefone/nome de contacto — para grupo pode ser subóptimo; avaliar skip ou registo especial quando `externalChatId` for `@g.us`.

### 4.5 Mensagens

- **`chat_messages`:** não há colunas dedicadas `sender_jid`, `sender_name`, `participant_phone`. O payload bruto do provider vai em **`metadata` (jsonb)** — o remetente em grupo **pode** estar só no JSON; a UI hoje pode não mostrar “quem falou”.
- **Reply / quote:** já existem `reply_*` em `chat_messages`; grupo pode reutilizar se o webhook popular.

### 4.6 UI

- `Chat.tsx` / floating chat: não há filtro “Grupos”, badge “Grupo”, painel admin de grupo, nem fluxos criar grupo / convite / comunidade.
- Ordenação por última mensagem já existe no backend para conversas; quando grupos forem syncados, **não** bump artificial por “só perfil” — hoje o risco é inexistente porque grupos não são upsertados no sync.

---

## 5. Tabelas — colunas novas sugeridas (alinhado ao plano)

| Tabela | Alteração |
|--------|-----------|
| **`chat_conversations`** | `conversation_type TEXT NOT NULL DEFAULT 'direct'` CHECK (`direct`|`group`|`community`) **ou** reutilizar inferência + coluna opcional; índice parcial para listas “só grupos”. |
| **`chat_messages`** | Opcional mas recomendado: `sender_jid`, `sender_display_name`, `participant_phone` (nullable) para queries e UI sem depender só de `metadata`; manter `metadata` como fonte completa. |
| **Nova `chat_group_profiles`** | Como no plano (tenant, instance, conversation, external_group_id, nome, descrição, convite, owner, counts, flags, `is_community`, `community_id`, jsonb). |
| **Nova `chat_group_participants`** | Como no plano (tenant, instance, conversation, participant_jid, role, admin, etc.). |
| **Audit** | Nova tabela ou extensão de logs existentes para acções admin de grupo (lista no plano §12). |

**Migração segura:** `DEFAULT 'direct'` + backfill: `UPDATE ... SET conversation_type = 'group' WHERE external_chat_id LIKE '%@g.us'` (ajustar se comunidade tiver outro padrão).

---

## 6. Endpoints / camada UAZAPI — o que falta

| Hoje | Falta |
|------|--------|
| `uazapiService`: `findChats`, `findMessages`, `sendTextMessage`, etc. | Cliente dedicado `uazapiGroupsClient.ts` (ou módulo) com métodos espelhando a tag **Grupos e Comunidades** da doc. |
| `POST /api/chat/sync` (conversas) | `GET/POST /api/chat/groups` (listar + persistir), sync de grupos no bootstrap/connect (atrás de feature flag). |
| — | CRUD participantes, settings de grupo, convite, comunidade (rotas do plano §4, §8, §11). |

**Controllers:** não chamar `fetch` UAZAPI directamente no `chatController`; extrair serviço (requisito §13).

---

## 7. Feature flag

O plano pede `WHATSAPP_GROUPS_ENABLED=false`. **Não existe** no código no momento da investigação; deverá ser lido em config + gates em rotas + UI.

---

## 8. Resumo executivo

| Pergunta | Resposta curta |
|----------|------------------|
| Grupos aparecem no sync? | **Não** — são filtrados antes do upsert; política actual “evitar poluir CRM”. |
| `@g.us` é reconhecido? | **Sim** em utilitários e resolução de mensagens. |
| Lista de chat mostra grupo? | **Só se** a conversa existir na BD (ex.: webhook); não via sync de lista. |
| Mensagens de grupo com remetente na UI? | **Parcial** — dados provavelmente em `metadata`; faltam colunas/UI. |
| UAZAPI já documenta grupos/comunidades? | **Sim** — 19 operações na tag oficial. |
| Próximo passo técnico? | Feature flag + remover filtro de grupo no sync (modo controlado) + `conversation_type` + client UAZAPI grupos + endpoints + UI. |

---

## 9. Riscos

- **Atendimento / Kanban:** conversas de grupo com `attendance_status` podem interagir mal com regras pensadas para 1:1 — plano diz para não alterar Kanban neste momento; definir se grupos entram em fila ou ficam “só chat”.
- **RLS / tenant:** todos os novos endpoints devem amarrar `instance_id` ao tenant do utilizador (padrão já usado em `loadInstanceForOperate`).

---

*Documento gerado na Fase 1 (investigação). Implementação nas fases seguintes do plano do produto.*
