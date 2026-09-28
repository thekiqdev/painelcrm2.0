# QA — Fase A Chat (Ordenação e Preview)

## 1. Objetivo

Validar de forma **objetiva e rastreável** que as correções aplicadas na Fase A garantem:

- `last_message_at` reflete a **última atividade real** (sem regressão por eventos antigos ou sync).
- `last_message_preview` é **consistente** com a última mensagem relevante (incluindo mídia sem texto).
- A **lista de conversas** permanece ordenada pela última atividade, alinhada entre backend e frontend.
- Atualizações em **tempo real (WebSocket)** refletem ordenação e preview **sem refresh manual**.

**Nota de escopo desta versão do documento:** a **execução funcional completa** (WhatsApp, webhooks, staging) **não foi realizada nesta sessão de documentação**. Foi feita **revisão estática do código** para apoiar os cenários e registrar pontos de atenção. Os cenários obrigatórios ficam com status **PENDENTE** até serem executados e preenchidos no ambiente acordado (staging/homologação).

---

## 2. Escopo validado

| Item | Escopo |
|------|--------|
| Persistência | `last_message_at`, `last_message_preview` em `chat_conversations` |
| Backend | `saveMessage`, `upsertConversation` (sync), `messageService.saveMessageToConversation`, `getConversations` (ORDER BY) |
| Frontend | `Chat.tsx` (ordenação local, WebSocket `conversation_updated` / `new_message`), `chat.ts` (`normalizeConversation`, `created_at`) |
| Fora deste QA | Identidade visual (avatar/nome), Fase B, refatorações |

---

## 3. Cenários testados

Os oito cenários obrigatórios estão detalhados na seção 4 (formato pedido: passos, esperado, observado, status).

---

## 4. Resultado por cenário

### Cenário 1 — Mensagem nova em conversa antiga

**Passos executados:** _(preencher após teste manual)_ Ex.: escolher conversa com baixa atividade; enviar mensagem; observar lista.

**Esperado:** conversa sobe ao topo; preview mostra a nova mensagem; horário/atividade coerentes.

**Observado:** _(preencher)_  

**Observado (revisão estática):** `getConversations` ordena por `COALESCE(c.last_message_at, c.created_at) DESC` (`chatController.ts`). `saveMessage` atualiza `last_message_at`/`last_message_preview` apenas quando o timestamp da mensagem é **≥** ao atual (evita regressão). O frontend reordena por `lastMessageAt` com fallback para `created_at`/`updated_at` (`Chat.tsx`).

**Status:** PENDENTE — execução manual

---

### Cenário 2 — Mensagem de mídia sem texto

**Passos executados:** _(preencher)_ Enviar ou simular mídia sem body textual; observar preview e posição.

**Esperado:** conversa sobe ao topo; preview não vazio; fallback coerente (ex.: `[Mídia]`).

**Observado:** _(preencher)_  

**Observado (revisão estática):** Em `saveMessage` (`chatController.ts`), quando há mídia e sem texto, o preview usa `"[Mídia]"`. No handler `new_message` em `Chat.tsx`, preview sem texto também usa `"[Mídia]"` para manter a lista alinhada ao socket.

**Status:** PENDENTE — execução manual

---

### Cenário 3 — Chegada fora de ordem

**Passos executados:** _(preencher)_ Simular mensagem antiga processada depois de uma nova.

**Esperado:** `last_message_at` não regride; lista não “cai” por evento antigo; preview não é substituído por mensagem antiga.

**Observado:** _(preencher)_  

**Observado (revisão estática):** `saveMessage` e `messageService.saveMessageToConversation` usam atualização condicional: só atualizam `last_message_*` se o novo `sent_at` for **≥** `last_message_at` existente (ou se `last_message_at` for nulo). Isso cobre o caso de processamento tardio.

**Status:** PENDENTE — execução manual

---

### Cenário 4 — Sync após mensagem mais nova

**Passos executados:** _(preencher)_ Gerar mensagem nova; executar sync de conversas; observar lista.

**Esperado:** sync não derruba `last_message_at`; não sobrescreve preview com valor mais antigo; posição correta.

**Observado:** _(preencher)_  

**Observado (revisão estática):** No ramo de **UPDATE** de `upsertConversation`, `last_message_preview` e `last_message_at` só são substituídos quando o timestamp vindo do sync (`$7`) é **≥** ao armazenado (ou quando o armazenado é nulo). Payload de sync com dados mais antigos não deve mais sobrescrever o mais recente.

**Status:** PENDENTE — execução manual

---

### Cenário 5 — Atualização por WebSocket sem refresh

**Passos executados:** _(preencher)_ Manter chat aberto; receber mensagem nova via socket.

**Esperado:** reordenação automática; preview atualiza; sem F5.

**Observado:** _(preencher)_  

**Observado (revisão estática):** `Chat.tsx` escuta `conversation_updated` e `new_message`, atualiza estado local e aplica `sort` por `lastMessageAt`. Eventos devem carregar `last_message_*` coerentes se o backend emitir após persistência correta.

**Status:** PENDENTE — execução manual

---

### Cenário 6 — Conversa sem `last_message_at`

**Passos executados:** _(preencher)_ Identificar conversa com `last_message_at` nulo (ou criar cenário de teste).

**Esperado:** fallback estável (ex.: `created_at`); ordenação não quebra.

**Observado:** _(preencher)_  

**Observado (revisão estática):** Backend: `ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`. Frontend: `loadConversations` e `sortConversationsByLastMessage` usam `lastMessageAt` com fallback para `created_at` e depois `updated_at` (`Chat.tsx`, tipo em `chat.ts` inclui `created_at`).

**Status:** PENDENTE — execução manual

---

### Cenário 7 — Consistência backend x frontend

**Passos executados:** _(preencher)_ Comparar JSON da API `GET /api/chat/conversations` com ordem exibida na UI (mesmo filtro de instância).

**Esperado:** critérios compatíveis; frontend não inverte ordem correta do servidor sem motivo (ex.: merge multi-instância).

**Observado:** _(preencher)_  

**Observado (revisão estática):** O frontend **reordena** após merge de várias instâncias e após eventos WebSocket — isso é esperado para “última atividade global”. Possível divergência pontual se o merge por `external_chat_id` descartar duplicata mantendo instância com dados mais fracos; validar com duas instâncias habilitadas.

**Status:** PENDENTE — execução manual

---

### Cenário 8 — Múltiplas mensagens rápidas

**Passos executados:** _(preencher)_ Enviar várias mensagens em sequência na mesma conversa.

**Esperado:** última mensagem vence; preview da mais recente; sem oscilação de posição incorreta.

**Observado:** _(preencher)_  

**Observado (revisão estática):** A lógica temporal em `saveMessage` favorece o maior `sent_at`; corrida de requests deve convergir para a mensagem com timestamp mais recente persistido.

**Status:** PENDENTE — execução manual

---

## 5. Evidências / observações

### 5.1 O que investigar (checklist técnico)

| # | Investigação | Achado (revisão estática) |
|---|----------------|----------------------------|
| 1 | Pontos que ainda gravam `last_message_at` “antigo” | Principais gravações em `saveMessage`, `upsertConversation` (sync) e `messageService` — atualização condicional por timestamp. Outros `UPDATE chat_conversations` (vínculo manual, unlink, herança de instância) **não** alteram `last_message_*`. |
| 2 | Preview vazio indevido | Texto vazio + sem mídia pode manter preview anterior (correto). Com mídia, `saveMessage` usa `"[Mídia]"`. |
| 3 | `.sort()` no frontend vs backend | Existe ordenação local em `Chat.tsx` após merge multi-instância e WebSocket — alinhada ao critério temporal; validar cenário multi-instância manualmente. |
| 4 | WebSocket vs fallback do backend | Lista depende dos valores emitidos/refletidos; se o payload do socket estiver desatualizado, a UI pode divergir até novo fetch — observar em teste. |
| 5 | Divergência webhook / sync / manual | Todos os caminhos relevantes devem passar por persistência que respeita ordem temporal; regressão restante seria bug de payload (`sentAt` nulo/incorreto) — documentar se ocorrer. |

### 5.2 Como registrar evidências (recomendado)

- **Print** da lista antes/depois ou vídeo curto.
- **Timestamp** e **ID da conversa** (UUID).
- Trecho do **response** de `GET /api/chat/conversations` com `last_message_at` e `last_message_preview`.
- Se possível, linha em log do backend no `saveMessage` (já existe log estruturado).

---

## 6. Bugs encontrados (se houver)

| ID | Cenário | Descrição | Severidade | Status |
|----|---------|-----------|------------|--------|
| — | — | Nenhum bug registrado nesta elaboração (execução manual ainda pendente). | — | — |

_Preencher esta tabela quando a execução manual encontrar falha real._

---

## 7. Conclusão

- As alterações da Fase A estão **alinhadas em código** com os critérios de não-regressão de `last_message_at`/`last_message_preview` e com fallback de ordenação usando `created_at`.
- A **comprovação em ambiente real** (WhatsApp, sync, WebSocket) **ainda não foi feita neste documento**; todos os cenários obrigatórios permanecem **PENDENTES** até execução e preenchimento dos campos “Observado”.

---

## 8. Recomendação: seguir ou não para Fase B

**Recomendação atual:** **Não iniciar a Fase B** até que:

1. Os **oito cenários obrigatórios** sejam executados em **staging** (ou ambiente equivalente) com resultado **OK** (ou **PARCIAL** apenas com causa documentada e aceita).
2. Os **sete critérios de aceite** abaixo sejam marcados como atendidos na prática.

### Critérios de aceite da Fase A

| Critério | Atendido? (preencher) |
|----------|------------------------|
| Conversas recentes sobem corretamente | ☐ |
| Preview representa a última mensagem | ☐ |
| Mídia sem texto não gera preview vazio | ☐ |
| Sync não regride a conversa | ☐ |
| WebSocket atualiza sem refresh obrigatório | ☐ |
| Fallback por `created_at` funciona | ☐ |
| Backend e frontend permanecem consistentes no cenário de uso principal | ☐ |

**Quando todos estiverem ☑**, a Fase A pode ser encerrada e a Fase B autorizada.

---

### Metadados do documento

| Campo | Valor |
|-------|--------|
| Versão | 1.0 (base para execução manual) |
| Data de elaboração | 2026-03-31 |
| Execução funcional | Pendente (preencher data/responsável após QA) |
