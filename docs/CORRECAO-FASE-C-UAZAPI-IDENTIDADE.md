# Correção — Fase C Uazapi e Identidade Visual

## 1. Problemas identificados

- **Campo de foto errado na persistência**: o schema oficial do objeto **Chat** na UazAPI documenta `image` e **`imagePreview`** (camelCase) como URL da imagem e da miniatura. O backend gravava `whatsapp_profile_photo` apenas a partir de `image` e `image_preview` (snake_case). Quando a API enviava só `imagePreview`, o valor **não era copiado** para `whatsapp_profile_photo` e o fallback visual quebrava em vários pontos.
- **Nome de exibição**: a ordem de prioridade não refletia o campo `name` (“Nome exibido do chat” no OpenAPI) antes de `wa_contactName` / `wa_name`.
- **Listas CRM**: clientes e leads nunca recebiam `whatsapp_avatar_url` na API de listagem; o frontend não tinha dado para avatar sem uma chamada extra por registro.
- **Sincronização pós-mensagem**: sync de mensagens e envio pelo painel atualizavam texto, mas **não reconsultavam** o chat na UazAPI (`POST /chat/find`), deixando nome/foto defasados em relação ao servidor.

## 2. Como a Uazapi estava sendo consultada antes

- **Listagem / refresh de conversa**: `POST /chat/find` com `wa_chatid`, `sort: '-wa_lastMsgTimestamp'`, corpo conforme OpenAPI (`/chat/find`).
- **Webhook**: combinação de `baseChat` + `data` + `message` passada a `normalizeChatPayload`, depois `upsertConversation`.
- **Extração de foto no upsert**: leitura apenas de `metadata.image` e `metadata.image_preview`, ignorando **`imagePreview`**.

## 3. O que estava errado

- Tratar `image_preview` como única alternativa a `image`, sem **`imagePreview`** alinhado ao OpenAPI.
- `getCrmWhatsappIdentity` e o merge em `metadata` não consideravam `imagePreview` na mesma ordem de prioridade.
- Ausência de **`whatsapp_avatar_url`** nas respostas de `GET /api/clients` e `GET /api/leads` (e por id).
- Ausência de re-sync de identidade após **sync de mensagens** e **envio de mensagem** pelo painel.

## 4. Como a consulta correta passou a funcionar

- Utilitário central `packages/backend/src/utils/uazapiChatIdentity.ts`:
  - **`extractUazapiChatImageUrl`**: `whatsapp_profile_photo` → `image` → **`imagePreview`** → `image_preview`.
  - **`extractUazapiChatDisplayName`**: `name` → `wa_contactName` → `wa_name` → `contactName` → `lead_name`.
- `upsertConversation` passa a usar `extractUazapiChatImageUrl` para definir `whatsapp_profile_photo` no JSON `metadata`.
- `normalizeChatPayload` usa `extractUazapiChatDisplayName` para `contact_name`; `profile_name` continua vindo de `wa_name` / `profileName`.
- `getCrmWhatsappIdentity` usa a mesma extração sobre `metadata`.
- Função interna **`fetchAndUpsertRemoteChatIdentity`**: mesmo fluxo que o endpoint manual de refresh — `findChats` + `normalizeChatPayload` + `upsertConversation`.

Referência OpenAPI (trecho Chat): `docs/uazapi-openapi-spec.yaml` — propriedades `name`, `wa_contactName`, `wa_name`, `image`, `imagePreview`; endpoint `POST /chat/find`.

## 5. Onde nome/foto agora são sincronizados

| Momento | Comportamento |
|--------|----------------|
| Webhook `messages` / `chats` | `upsertConversation` com metadata completa + foto extraída corretamente |
| Sync de conversas (fluxo existente) | Inalterado na forma; payload normalizado melhora nome/foto |
| **Sync manual de mensagens** (`syncConversationMessages`) | Após salvar mensagens, chama **`fetchAndUpsertRemoteChatIdentity`** |
| **Envio de mensagem pelo chat** (`sendMessage`) | Após gravar mensagem, refresh assíncrono de identidade (não bloqueia resposta) |
| Refresh manual | `POST .../refresh-identity` — usa `fetchAndUpsertRemoteChatIdentity` |
| **Listagem CRM** | `LEFT JOIN LATERAL` em `chat_conversations` por `client_id` / `lead_id`, última conversa por `last_message_at`, campo calculado **`whatsapp_avatar_url`** |

## 6. Como o fallback visual funciona agora

Regra única (igual à Fase B/C): **foto CRM** (`avatar_url` / `photo` se existirem no objeto) → **foto WhatsApp** (`whatsapp_avatar_url` ou metadata) → **iniciais**.

- Frontend: `resolveProfileAvatarUrl` / `resolveConversationIdentity`; `pickWhatsAppPhoto` em `chatIdentityDisplay.ts` também lê **`imagePreview`** no metadata.
- Listas: avatar com `resolveProfileAvatarUrl(entidade, entidade.whatsapp_avatar_url)`.

## 7. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `packages/backend/src/utils/uazapiChatIdentity.ts` | **Novo** — extração nome/foto alinhada ao OpenAPI |
| `packages/backend/src/controllers/chatController.ts` | normalize + upsert + getCrmWhatsappIdentity; `fetchAndUpsertRemoteChatIdentity`; sync mensagens + sendMessage |
| `packages/backend/src/controllers/clientsController.ts` | `whatsapp_avatar_url` em listagem e `getClientById` |
| `packages/backend/src/controllers/leadsController.ts` | `whatsapp_avatar_url` em listagem e `getLeadById` (requer coluna `lead_id` em `chat_conversations`) |
| `src/utils/chatIdentityDisplay.ts` | `imagePreview` em `pickWhatsAppPhoto` |
| `src/pages/ClientProfile.tsx` | Usa `client.whatsapp_avatar_url` + refresh via API chat |
| `src/pages/Clients.tsx` | Coluna avatar na tabela |
| `src/components/leads/LeadListTable.tsx` | Coluna avatar |
| `src/components/leads/LeadDetailsDialog.tsx` | Sincroniza com `lead.whatsapp_avatar_url` |

## 8. Como validar manualmente

1. **Contato com foto no WhatsApp**: abrir conversa — avatar e nome coerentes; webhook ou refresh deve preencher metadata.
2. **Cliente sem foto CRM, com conversa vinculada**: perfil e lista mostram foto WhatsApp.
3. **Cliente com foto CRM** (se o modelo expuser `avatar_url`/`photo`): mantém CRM.
4. **Lista de clientes / leads**: coluna de avatar com fallback.
5. **Sync manual de mensagens**: após sync, nome/foto atualizados (uma chamada `findChats` no fim).
6. **Mensagem outbound pelo painel**: identidade não “some”; refresh assíncrono mantém dados alinhados à UazAPI.

## 9. Riscos remanescentes

- **Migração `lead_id`**: listagem de leads com `whatsapp_avatar_url` exige coluna `lead_id` em `chat_conversations` (ex.: `database/init/85_chat_conversations_link_hardening.sql`). Ambientes sem migração podem falhar no `GET /api/leads`.
- **URLs temporárias**: links de mídia da UazAPI podem expirar; comportamento é o da própria API.
- **Cache React Query**: após atualizar conversa no chat, a lista de clientes pode precisar de **refetch** para ver avatar novo até o próximo carregamento (mitigado na rodada final com `invalidateQueries` após sync da conversa — ver §10).
- **Grupos**: identidade de grupo usa os mesmos campos Chat; grupos podem ter `image`/`imagePreview` diferentes de contato individual.

---

## 10. Fechamento Fase C — problemas remanescentes e correção final

### O que ainda faltava (após a primeira correção)

| Área | Causa real |
|------|------------|
| **Lista de clientes** | O `useQuery` em `Clients.tsx` **remapeava** cada cliente para um objeto só com `id`, `name`, `company`, etc., e **omitia** `whatsapp_avatar_url`. A API já enviava o campo (lateral join no backend), mas o frontend **descartava** antes de renderizar o avatar. |
| **Lista de leads** | A API já devolvia `whatsapp_avatar_url` no array; o fluxo da lista estava correto. O gap principal era o **perfil** (abaixo) e cache desatualizado após sync no chat. |
| **Perfil do lead** | Ao abrir o diálogo, o `selectedLead` vinha só da linha da tabela — sem refetch de `GET /api/leads/:id`, ficando desalinhado do **perfil do cliente** (que usa `getClientById` completo). |
| **Sync manual da conversa** | (1) Ordem: `loadMessages` rodava **antes** de `refreshConversationIdentity`, e o estado local da conversa só atualizava no `loadConversations` genérico — sem merge imediato da linha retornada pelo refresh. (2) `fetchAndUpsertRemoteChatIdentity` usava **`chatsArray[0]`** quando não havia match de `wa_chatid`, podendo aplicar **nome/foto de outro chat**. (3) `contact_name`/`profile_name` com `COALESCE($2, contact_name)` não tratavam string vazia de forma explícita (menos crítico que os itens anteriores). |

### O que foi corrigido nesta rodada

- **`Clients.tsx`**: o map do `queryFn` passa a incluir `whatsapp_avatar_url` (mesma prioridade visual do perfil via `resolveProfileAvatarUrl` na tabela).
- **`clients.ts`**: tipo `Client` documenta `whatsapp_avatar_url` opcional.
- **`Leads.tsx` / `handleViewLead`**: após clicar no lead, busca **`GET /api/leads/:id`** e define `selectedLead` com o payload completo (incl. `whatsapp_avatar_url`), espelhando o carregamento do perfil de cliente.
- **`Chat.tsx` / `handleSyncConversation`**: ordem **sync mensagens → refresh identidade →** `setConversations` com a conversa normalizada retornada pelo refresh **→** `loadMessages` **→** `loadConversations`; `invalidateQueries` para `['clients','list']` e `['leads']` para atualizar listas ao voltar ao CRM.
- **`chatController.ts`**: removido o fallback `item = chatsArray[0]` em `fetchAndUpsertRemoteChatIdentity`; `UPDATE` usa `COALESCE(NULLIF(TRIM($2::text), ''), contact_name)` (e o mesmo padrão para `profile_name`).

### Arquivos alterados nesta rodada final

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Clients.tsx` | Preservar `whatsapp_avatar_url` no objeto derivado do `useQuery` |
| `src/services/clients.ts` | Campo opcional `whatsapp_avatar_url` na interface |
| `src/pages/Leads.tsx` | `handleViewLead` com `GET /api/leads/:id` antes de abrir o diálogo |
| `src/pages/Chat.tsx` | Ordem do sync, merge da conversa no estado, `useQueryClient` + invalidação de clientes/leads |
| `packages/backend/src/controllers/chatController.ts` | Remoção do fallback inseguro em `fetchAndUpsertRemoteChatIdentity`; `TRIM`/`NULLIF` em nome no `UPDATE` |

### Validação sugerida (pós-rodada)

1. Perfil do cliente: sem regressão.  
2. Lista de clientes: avatar com CRM → WhatsApp → iniciais.  
3. Lista de leads: idem (dados da API + componente já existente).  
4. Abrir lead: avatar alinhado ao GET por id.  
5. Sync na conversa: nome/foto atualizam na thread e listas CRM após sair do chat ou ao invalidar cache.

---

## 11. Ajustes finais UX Chat + CRM (pós-Fase C)

- **Remover vínculo**: removido só do UI do Chat (`Chat.tsx`); endpoint mantido.
- **Um botão de sincronizar**: já unificava `syncConversationMessages` + `refreshConversationIdentity`; título do ícone atualizado.
- **Label “Foto do WhatsApp”**: removida de `ClientProfile`, `ClientSidebar`, `LeadDetailsDialog` (mantida apenas a imagem / fallback).
- **Conversão lead → cliente**: `PATCH` aceita `migrated_client_id` (UUID do cliente criado) para migrar `chat_conversations` (lead_id → client_id) sem depender do match por telefone; usado em `Leads.tsx` e `Chat.tsx` ao converter.
- **Leads convertidos**: `GET /api/leads` (padrão) exclui `status = 'Convertido'`; `?onlyConverted=true` para a aba “Convertidos”. `LeadFilters`: ordem Todos → Novos → demais status → Convertidos (última).

## 12. Aba “Convertidos” sem avatar WhatsApp (lead → cliente)

### Causa real

Após `migrateConversationLeadToClient`, `chat_conversations.lead_id` passa a `NULL` e a conversa fica só com `client_id`. O `LEFT JOIN LATERAL` que monta `whatsapp_avatar_url` filtrava apenas `cc.lead_id = l.id`, então **deixava de encontrar** a conversa para leads com `status = 'Convertido'`. O frontend (`LeadListTable` + `resolveProfileAvatarUrl`) já estava correto; o campo vinha **NULL** na API.

### Correção

No mesmo lateral em `getLeads` e `getLeadById`, o vínculo aceita também:

1. **`metadata.link_migration.previous_lead_id = lead.id`** — gravado na migração ao converter.
2. **Fallback por telefone** (mesma regra de dígitos que `normalizeConversationPhone` / match em `updateLead`): conversa com `client_id` cujo cliente do tenant casa com o telefone do lead.

Prioridade visual no cliente continua: **foto CRM** → **WhatsApp** (`whatsapp_avatar_url`) → **placeholder**.

### Arquivos

- `packages/backend/src/controllers/leadsController.ts` — condição ampliada no lateral de `whatsapp_avatar_url`.
