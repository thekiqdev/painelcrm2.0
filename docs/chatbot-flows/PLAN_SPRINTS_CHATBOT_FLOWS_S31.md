# Plano de sprints — Chatbot Flows S31 (gatilho tag/kanban · opt-out)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-06 |
| **Tipo** | Entrega de sprint |
| **Base** | [`PLAN_SPRINTS_CHATBOT_FLOWS_S28.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S28.md) §9 |
| **Nome** | **S31 — Gatilho por tag / coluna kanban + opt-out `parar`/`sair`** |
| **Status** | **Feito** |
| **Próximo** | **S32–S33.2 feitos** — [`PLAN_SPRINTS_CHATBOT_FLOWS_S32.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S32.md) · **S34 feito** — [`PLAN_SPRINTS_CHATBOT_FLOWS_S34.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S34.md) |

---

## 1. Meta

Dois candidatos adiados desde S22:

1. **Gatilho CRM:** flow publicado inicia quando a conversa ganha uma **tag** ou o card entra numa **coluna kanban**.
2. **Opt-out global:** contato envia exatamente `parar` ou `sair` → sessão viva do bot **encerra** e a mensagem **não** alimenta `waiting_input` nem dispara keyword/first_message.

---

## 2. Decisões

| ID | Decisão |
|----|----------|
| **D31.1** | Novos tipos no `start.data.trigger`: `tag` (`tag_id` e/ou `tag_label`) e `kanban_column` (`column_id`, `board_id?`) |
| **D31.2** | Tag/coluna **não** casam no inbound de mensagem — só em eventos CRM (add tag / create-or-move card) |
| **D31.3** | Guards S24 (dm_only, instance, schedule, cooldown, priority) aplicam-se ao start por evento |
| **D31.4** | Sessão viva na conversa → **não** inicia outro flow por tag/coluna (ignore); start manual continua a encerrar |
| **D31.5** | Loop-safe: ações do próprio runtime (`add_tag` / `move_kanban`) **não** re-disparam flows (`source: chatbot_flows`) |
| **D31.6** | Opt-out = **equals** (trim + lower) em `parar` \| `sair`; encerra sessão (`ended`, reason `opt_out`); não inicia flow nessa mensagem; ack curto opcional |

---

## 3. Schema (start.trigger)

```ts
| { type: 'keyword'; value; match?; keywords? }
| { type: 'first_message'; idle_after_hours? }
| { type: 'tag'; tag_id?: uuid | null; tag_label?: string | null }  // id e/ou label
| { type: 'kanban_column'; column_id: uuid; board_id?: uuid | null }
```

Publish exige tag com id ou label; coluna com `column_id`.

---

## 4. Runtime

### 4.1 Opt-out (`runChatbotFlowsRuntimeInbound`)

1. Feature runtime on; humano busy → pause (inalterado).
2. Se `isGlobalOptOutWord(body)`:
   - Encerra sessões vivas (`ended` + log `opt_out`).
   - Ack: “Fluxo encerrado.” (best-effort).
   - `return true` se havia sessão (Phase 8 skip); `false` se não havia (mensagem segue normal).
3. Demais caminhos keyword / first_message inalterados (tag/coluna ignorados no match de mensagem).

### 4.2 Evento tag / coluna

`runChatbotFlowsRuntimeFromCrmEvent`:

1. Feature + conversa + não humano busy.
2. Sem sessão viva.
3. Lista flows ativos publicados; filtra trigger `tag` / `kanban_column` + guards.
4. Prioridade S24 → cria sessão → `processInboundStep(justStarted)` → `applyRuntimeActions`.

Hooks:

- `addKanbanTagToConversation` (após add real) se `source !== 'chatbot_flows'`.
- `createCard` / `patchCard` (entrada em coluna com `conversation_id`) — não no `runtimeEnsureKanbanCard`.

---

## 5. UI

Nó **Início** → “Quando iniciar”:

- Primeira mensagem / idle  
- Palavra-chave  
- **Tag** (picker)  
- **Coluna Kanban** (board + coluna)

Preview no canvas: `Tag: …` / `Kanban: coluna`.

---

## 6. Aceite

- [x] Publicar flow com trigger `tag` e iniciar ao adicionar a tag na conversa (não pelo bot)
- [x] Publicar flow com trigger `kanban_column` e iniciar ao criar/mover card para a coluna (UI)
- [x] `add_tag` / `move_kanban` do runtime **não** re-disparam o mesmo flow
- [x] Mensagem `parar` ou `sair` (equals) encerra sessão viva e não avança `waiting_input`
- [x] Keyword / first_message / guards S24 sem regressão
- [x] Testes unitários (match tag/coluna + opt-out)
- [x] Ponteiros do plano atualizados; S32+ **não** misturados

---

## 7. Fora de escopo

- Opt-out persistente (blocklist permanente do contato)
- Gatilho por remoção de tag / saída de coluna
- Marketplace / templates prontos tag→flow
- S6 matriz QA staging completa

---

## 8. Próximo passo operacional

1. ~~Implementar S31.~~
2. Smoke staging: tag na conversa + move de coluna + `parar` no WhatsApp.
3. Próximo: **S32–S33.2 feitos** — [`PLAN_SPRINTS_CHATBOT_FLOWS_S32.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S32.md).
