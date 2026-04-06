# Investigação — Identidade, Foto e Sync no Chat

## 1. Problemas observados

Sintomas relatados (alinham-se com o que o código permite):

- Conversas em que o **nome** não aparece e só o **número** é mostrado.
- **Foto** ausente em parte das conversas, no **perfil do cliente** e na **lista de clientes**.
- Sensação de que **nome/foto “aparecem depois que o cliente manda mensagem”** e não quando só o operador/sistema envia.
- Dúvida sobre o que o botão **“Sincronizar”** faz e se deveria atualizar também identidade (nome/foto).

Esta investigação mapeia **causas técnicas prováveis** com base no repositório atual, **sem implementar correção**.

---

## 2. Estado atual do fluxo (visão geral)

| Fonte | Atualiza `chat_conversations` (nome/foto/metadata)? | Observação |
|--------|-----------------------------------------------------|------------|
| **Webhook** (`processWebhookEvent`, evento de mensagem) | **Sim** — chama `upsertConversation` **antes** de `saveMessage`, mas **apenas para um subconjunto de mensagens** | Ver seção 6. |
| **`POST /api/chat/conversations/sync`** (`syncConversations`) | **Sim** — lista remota (`findChats`) + `normalizeChatPayload` + `upsertConversation` | Atualiza identidade conforme payload da UazAPI. |
| **`POST /api/chat/conversations/:id/messages/sync`** (`syncConversationMessages`) | **Não** para identidade | Só busca mensagens (`findMessages`) e chama `saveMessage` em loop. |
| **`sendMessage` (API)** | **Não** para nome/foto do contato | Apenas `saveMessage` da mensagem outbound; **não** chama `upsertConversation` com dados de perfil. |
| **Criação mínima de conversa** (ex.: fluxos em `messageService`) | Conversa pode nascer só com telefone | Não preenche `contact_name` / foto. |

A **identidade persistida** na conversa (`contact_name`, `profile_name`, `metadata` com imagem / `whatsapp_profile_photo`) depende de **chegar um payload** que o `normalizeChatPayload` saiba ler **e** de o `upsertConversation` gravar (com regras `COALESCE` no UPDATE).

---

## 3. Onde nome é resolvido

### 3.1 Backend — persistência

- Campos na tabela: `contact_name`, `profile_name`, `phone_number`, `external_chat_id` (`database/init/15_create_chat_tables.sql`).
- Preenchimento principal em `upsertConversation` (`packages/backend/src/controllers/chatController.ts`), a partir de `normalizeChatPayload(raw)`:
  - `contactName` ← `wa_contactName`, `contactName`, `lead_name`, `name`, etc.
  - `profileName` ← `wa_name`, `profileName`, etc.
  - O `raw` costuma ser o item do **sync de conversas**, o **objeto combinado no webhook** (`baseChat` + `data` + `message`) ou vazio se o provedor não enviar.

- No **UPDATE** existente, uso de `COALESCE($2, contact_name)` (e análogo para `profile_name`): se o novo valor vier **nulo**, o banco **mantém o antigo**. Isso evita apagar nome, mas também significa: **se nunca houve nome e o payload continua sem nome, continua vazio** — a UI cai no número.

### 3.2 Frontend — exibição (Fase B)

- Arquivo `src/utils/chatIdentityDisplay.ts` + uso em `src/pages/Chat.tsx`:
  - **Cliente vinculado:** nome primário do **CRM** (`clients` carregados em memória ou `currentClient` após `getConversationProfile`).
  - **Lead vinculado:** nome do **CRM** (`leads` / `currentLead`).
  - **Sem vínculo ou CRM ainda não carregado:** `contact_name` / `profile_name` → telefone formatado → `external_chat_id`.

Consequências:

- **Só número:** quando `contact_name`/`profile_name` estão vazios **e** não há vínculo com nome no CRM **e** o fallback vira telefone.
- **Cliente vinculado mas “nome errado”:** se `clientsById` não tem o cliente (lista não carregada) ou o CRM não tem `name`, o resolvedor usa fallbacks da conversa.
- **Operador envia primeiro:** webhook **não enriquece** a conversa nesse caminho (ver seção 6); `sendMessage` **não** chama `upsertConversation`. Assim, **nome de WhatsApp pode continuar ausente** até um evento que traga payload completo (ex.: inbound, ou sync de conversas).

---

## 4. Onde foto é resolvida

### 4.1 Conversa / chat

- **Persistência:** em `upsertConversation`, imagem derivada de `chatData.metadata` (`image`, `image_preview`) e gravação de `whatsapp_profile_photo` no `metadata` quando aplicável (`chatController.ts`).
- **API → frontend:** `normalizeConversation` em `src/services/chat.ts` monta `avatarUrl` a partir de `metadata.image` / `image_preview` / `imagePreview` / `whatsapp_profile_photo`.
- **Fase B:** `resolveConversationIdentity` prioriza **foto CRM** (`avatar_url` / `photo` no objeto cliente/lead, se existir) **depois** WhatsApp.

### 4.2 Por que “some conversas sem foto”

- Payload da UazAPI **sem** campos de imagem no sync ou no webhook.
- Conversa **nunca passou** por `upsertConversation` com imagem (ex.: só mensagens outbound processadas pelo webhook com **early return** — ver §6).
- **CRM sem foto:** se não houver `avatar_url`/`photo` no objeto cliente/lead retornado pela API, o fallback é só WhatsApp; se também não houver, só placeholder.

### 4.3 Perfil do cliente e lista de clientes

- **Fase B** alterou **lista e cabeçalho do Chat** (`Chat.tsx` + `chatIdentityDisplay.ts`), **não** o perfil nem a lista de clientes.
- `getConversationProfile` (`chatController.ts`) retorna `SELECT * FROM clients` / `leads` — **sem** junção com `chat_conversations` para trazer foto WhatsApp.
- Tabela base `clients` em `04_create_leads_and_clients.sql` **não inclui** coluna de foto; o frontend em alguns pontos usa `avatar_url` / `photo` como campos **opcionais** se a API os devolver (podem vir de evoluções posteriores ou outros módulos). Se a API não retorna foto, **não há o que renderizar** no perfil/lista além de placeholder.

**Conclusão parcial:** a ausência de foto em **perfil/lista de clientes** não é “bug” da Fase B do chat; é **fora do escopo entregue** e/ou **dado não disponível** no modelo de cliente exposto à UI.

---

## 5. Como o sync funciona hoje

### 5.1 `POST /api/chat/conversations/sync` — **sync de conversas** (lista remota)

- Implementação: `syncConversations` em `chatController.ts`.
- Chama `uazapiService.findChats` com `sort` padrão `-wa_lastMsgTimestamp`, normaliza cada item com `normalizeChatPayload` e executa `upsertConversation`.
- **Efeito:** atualiza **conversas** (incluindo nome/preview/timestamp/`metadata` conforme o payload), **não** mensagens antigas linha a linha.

**Onde aparece na UI:**

- `chatService.syncConversations` é usado em `src/components/whatsapp/InstanceDetailsDialog.tsx`.
- Em `Chat.tsx`, existe `handleSyncConversations` **definido**, mas **não há referência no JSX** (apenas estado `syncingConversations` + handler): ou seja, **a tela principal do chat não expõe** “sincronizar conversas” da mesma forma que o diálogo de instância.

### 5.2 `POST /api/chat/conversations/:id/messages/sync` — **sync de mensagens**

- Implementação: `syncConversationMessages` em `chatController.ts`.
- Chama `uazapiService.findMessages`, depois **somente** `saveMessage` por mensagem.
- **Não** chama `upsertConversation`.
- **Efeito:** histórico de mensagens + `last_message_*` via `saveMessage`; **não** atualiza nome/foto do contato a partir do chat.

### 5.3 Botão “Sincronizar” no header da conversa (Chat)

- Em `Chat.tsx`, o ícone com `title="Sincronizar mensagens"` chama **`handleSyncMessages`** → **`syncConversationMessages`**.
- Portanto, o botão visível **hoje só sincroniza mensagens**, **não** identidade de contato (nome/foto) da conversa.

### 5.4 Deveria esse botão atualizar nome/foto?

**Não** foi desenhado assim no código atual: o endpoint usado é **apenas** de mensagens. Para alinhar expectativa de produto com implementação, ou:

- **Mudar o comportamento do botão** (ou adicionar um segundo botão) para chamar também `syncConversations` (instância) ou um endpoint dedicado “refresh contact profile”, **ou**
- **Manter** o botão só para mensagens e **documentar** na UI que identidade vem de sync de conversas / webhook.

---

## 6. Diferença entre inbound, outbound e sync manual

### 6.1 Webhook — mensagem **recebida** (cliente)

- Fluxo: `processWebhookEvent` → monta `chatData` com `baseChat` + dados da mensagem → `upsertConversation` → `saveMessage`.
- **Atualiza identidade** da conversa quando o payload traz nome/foto.

### 6.2 Webhook — mensagem **enviada pelo operador / API**

- Trecho explícito em `processWebhookEvent`:

```3084:3091:packages/backend/src/controllers/chatController.ts
      // Ignorar mensagens enviadas pela API para evitar loops
      if (extracted.message.wasSentByApi || extracted.message.fromMe) {
        console.log(`[Webhook ${webhookId}] Skipping API-sent message`, {
          messageId: extracted.message.id || extracted.message.messageId,
          direction: extracted.direction,
        });
        return;
      }
```

- **Efeito:** para `fromMe` / `wasSentByApi`, **não** roda `upsertConversation` nem `saveMessage` neste handler (evita loop).
- O envio pelo painel é persistido via **`sendMessage`** no backend, que **não** atualiza perfil do contato na conversa.

**Hipótese funcional:** “só aparece nome/foto quando o cliente manda mensagem” — **compatível com o código:** o caminho que **enriquece** a conversa via webhook está focado em mensagens **inbound**; outbound pelo webhook é **ignorado**.

### 6.3 Sync manual de mensagens (botão no chat)

- Só `findMessages` + `saveMessage` — **sem** enriquecimento de contato.

### 6.4 Sync de conversas (lista de chats)

- `findChats` + `upsertConversation` — **com** enriquecimento, **se** a API retornar os campos esperados por `normalizeChatPayload`.

---

## 7. Causa provável (síntese)

Não é um único bug, e sim **combinação**:

1. **Persistência / provedor:** `contact_name` / `profile_name` / imagem dependem do **payload** UazAPI; campos ausentes ou formato diferente → valores vazios ou só telefone.
2. **`COALESCE` no UPDATE:** não sobrescreve com `NULL` — conversa sem nome continua sem nome até chegar um payload com nome.
3. **Webhook ignora outbound:** não há segundo caminho para atualizar identidade quando só o operador fala (além de sync de conversas ou outro endpoint).
4. **`sendMessage` não chama `upsertConversation`:** envio não “puxa” foto/nome do contato.
5. **`syncConversationMessages` não atualiza identidade:** o botão “Sincronizar” do header **não** resolve nome/foto.
6. **Fase B (frontend):** unificou **exibição** no chat, mas se o **dado** não existe no CRM nem na conversa, ainda se vê número/placeholder.
7. **Perfil/lista de clientes:** escopo e **modelo de dados** de foto no cliente não foram cobertos pela Fase B; foto WhatsApp **não está ligada** ao cadastro nesses ecrãs.

---

## 8. Correção recomendada (incremental, sem refatorar arquitetura)

Ordem sugerida (cada item pode ser um PR pequeno):

1. **Produto / UX**
   - Renomear ou complementar o botão atual: ex. “Sincronizar mensagens” e, se desejado, ação separada “Atualizar dados do contato” que chame **`syncConversations`** (ou endpoint mínimo que re-fetch apenas um chat na UazAPI, se existir).

2. **Backend (baixo risco)**
   - Opcional: após `sendMessage` bem-sucedido, **uma** chamada leve para enriquecer conversa (ex.: `findChats` filtrado ou endpoint de “get chat” por id) + `upsertConversation`, com **rate limit** / não bloquear resposta — **avaliar** com cuidado para não sobrecarregar a API externa.
   - Ou: **não** mudar webhook (evitar loops), mas documentar que identidade vem de **sync de conversas** ou **inbound**.

3. **Sync de conversas na UI do Chat**
   - Expor `handleSyncConversations` (já existente) em algum lugar visível **ou** reutilizar o fluxo de `InstanceDetailsDialog` — para o usuário **não depender** só do webhook inbound para nome/foto.

4. **CRM (fora do chat, quando prioridade for perfil/lista)**
   - Fallback visual WhatsApp no perfil/lista exige **decisão** de armazenamento (já descrita no plano: só UI vs coluna `metadata`) — **não** misturar com financeiro.

---

## 9. Arquivos impactados (referência)

| Área | Arquivos |
|------|----------|
| Normalização de chat / upsert | `packages/backend/src/controllers/chatController.ts` (`normalizeChatPayload`, `upsertConversation`, `syncConversations`, `syncConversationMessages`, `sendMessage`, `processWebhookEvent`, `getConversationProfile`) |
| Rotas | `packages/backend/src/routes/chatRoutes.ts` |
| Frontend chat / identidade | `src/pages/Chat.tsx`, `src/utils/chatIdentityDisplay.ts`, `src/services/chat.ts` |
| Sync na UI de instância | `src/components/whatsapp/InstanceDetailsDialog.tsx` |
| Cliente (lista/perfil) | `src/pages/ClientProfile.tsx`, `src/components/clients/*`, `src/services/clients.ts`, `packages/backend/src/controllers/clientsController.ts` |
| Schema | `database/init/15_create_chat_tables.sql`, `database/init/04_create_leads_and_clients.sql` |

---

## 10. Riscos

- **Chamar `upsertConversation` em todo outbound** pode gerar **loops** ou carga na UazAPI se não for idempotente e controlado.
- **Alterar o webhook** para processar `fromMe` exige **critérios claros** (deduplicação com `sendMessage`).
- **Expectativa do botão “Sincronizar”:** mudar comportamento sem mudar rótulo pode confundir usuários; preferir **rótulo explícito** ou duas ações.
- **Foto no CRM:** sem coluna/API estável, “corrigir” só no frontend pode **inventar** dados que não existem no banco.

---

## Resposta direta à pergunta do botão

| Pergunta | Resposta com base no código |
|----------|------------------------------|
| O botão “Sincronizar” do **header da conversa** atualiza nome/foto? | **Não.** Ele chama **`syncConversationMessages`** (apenas mensagens). |
| O sync de **conversas** (`syncConversations`) atualiza nome/foto? | **Sim**, via `upsertConversation` e `normalizeChatPayload`, **se** a UazAPI devolver os campos. |
| Esse botão **deveria** passar a atualizar nome/foto? | **Decisão de produto.** Tecnicamente, o comportamento atual **não** foi feito para isso; para atender a expectativa, ou **muda-se** a ação do botão ou **adiciona-se** uma ação explícita de “atualizar contato / sincronizar conversas”. |

---

*Documento gerado por investigação estática do repositório; validar em ambiente de staging com payloads reais da UazAPI.*
