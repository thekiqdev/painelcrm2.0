# AUDIT_TF5 — Duplicatas WS + lista `/chat` embaralhada

| Campo | Valor |
|---|---|
| **Documento** | Auditoria (pré-correção) |
| **Data** | 2026-07-15 |
| **Ambiente** | Produção (teste pós deploy ownership + TF1–TF4) |
| **Tipo** | Dois bugs de superfície — Domain Store / realtime FE |
| **Backend / SQL / Redis / Socket protocol / Flags catalog** | **NÃO alterar** neste hotfix (emitir dual legado+v2 fica OOS; FE deve tolerar) |
| **Successor de implementação** | Hotfix TF5 — **CLOSED** → [`SPRINT_TF5_CLOSEOUT.md`](./SPRINT_TF5_CLOSEOUT.md) |

---

## Sintomas reportados (produção)

### Bug A — bolhas duplicadas ao receber mensagem

| Observação | Evidência |
|---|---|
| Uma msg inbound gera **várias** bolhas na mesma thread | Print: 7× `"oi"` |
| Parte com horário válido, parte com `--:--` | `15:52` vs `--:--` |
| **F5 / reload normaliza** | SoT HTTP ≠ SoT WS em memória |

### Bug B — lista de conversas “embaralha” ao abrir `/chat`

| Observação | Evidência |
|---|---|
| Ao entrar em `/chat`, a ordem inicial **não** parece a final | Relato manual |
| Depois a lista **reorganiza** (salta) até estabilizar | Sensação de “sempre reorganizando” |
| Desejo de produto | Ordem correta **já no primeiro paint** (Store como SoT de ordem) |

---

## Escopo da auditoria

| Inclui | Não inclui |
|---|---|
| Caminhos Store ON (produção atual) | Paginação inbox 50 + load more |
| Bridge Socket → Domain Store | Remoção física Store OFF (MB-028) |
| `messages/append` + normalize de payload v2 | Unificar emits no backend |
| `conversations/set` / `upsert` + `orderedIds` | Kanban / ADR flips |
| Relação UI sort (`Chat.tsx`) vs Store order | Avatar F5 (TF3.3) |

---

## Bug A — análise

### Pipeline (Store ON)

```
WhatsApp inbound / send
  → backend: emitNewMessage (legado `new_message` + nested message.id)
  → backend: emitToTenant `message.created` (flat: message_id, provider_message_id, sent_at)
  → ChatRealtimeBridge escuta AMBOS
  → normalizeSocketEventByName → kind message.created
  → syncStoreFromSocketEvent → mapDomainEventToActions → messages/append
  → selectors → bolhas
```

Referências:

- `src/features/chat-core/realtime/bridge.ts` — listeners `message.created` **e** `new_message`
- `packages/backend` — pares `emitNewMessage` + `emitToTenant('message.created', buildMessageCreatedPayload(...))`
- Payload v2: `packages/backend/src/services/communication/realtimePayloads.ts` (`message_id`, não `id`)

### Causa raiz (cadeia)

1. **Dupla emissão** (legado + v2) para a mesma lógica — aceitável se o FE **deduplicar**.
2. Payload v2 flat usa `message_id` / `provider_message_id`; `normalizeChatMessage` (sem hotfix) só lia `raw.id` / `external_message_id`.
3. `mapLegacyMessageToDomain` faz fallback:
   ```ts
   id: normalized.id ?? ... ?? `temp-${crypto.randomUUID()}`
   ```
   → **cada** evento v2 mal normalizado vira **id novo**.
4. `messages/append` só skipa se `existingIds.includes(message.id)` — **não** dedupe por `externalMessageId` / `clientMessageId`.
5. Sem `sentAt` utilizável → `formatHour` (`chatPageHelpers`) → `--:--`.
6. F5: GET messages retorna 1 row canônica → Store replace → UI OK.

### Por que N bolhas (não só 2)

Além do par legado+v2, qualquer reentrega / segundo path (worker, retry, room user+tenant) com `temp-*` gera novas bolhas. O mínimo garantido pelo desenho atual é **≥2** por inbound quando o flatten v2 falha.

### Hipóteses descartadas (neste audit)

| Hipótese | Por quê descartar |
|---|---|
| Só bug do virtualizer | Horários diferentes = dados distintos no Store |
| Persistência duplicada no DB | F5 normaliza |
| TF4 `openConversationMessagesCommand` | Roda no **open**, não a cada inbound |

### Fix proposto (mínimo FE)

| # | Mudança | Arquivo |
|---|---|---|
| A1 | `id = raw.id ?? raw.message_id`; `external_message_id ← provider_message_id`; `sentAt` aceitar `Date` → ISO | `src/services/chat.ts` (`normalizeChatMessage`) |
| A2 | Flatten payload v2 em `pickMessageFromPayload` (campos no root sem `.message`) | `eventAppliers.ts` |
| A3 | `messages/append`: skip/merge por `id` **ou** mesmo `externalMessageId` / `clientMessageId`; promover id canônico se existente era `temp-*` | `actions.ts` |

**Não fazer no hotfix:** parar emit legado no BE (OOS); exigir um único protocolo.

### Critério de aceite A

- [ ] Uma inbound → **uma** bolha (Float e `/chat`).
- [ ] Horário ≠ `--:--` quando `sent_at` veio no WS.
- [ ] F5 não muda a contagem daquela msg.

### Testes (já esboçados)

`src/features/chat-core/store/store.tf5.ws-message-dedupe.test.ts` — bloco **Bug A** (hoje falha se o fix não estiver aplicado no tree).

---

## Bug B — análise

### Pipeline da lista (Store ON)

```
Mount /chat
  → ensureChatDomainStoreSession
  → (opcional) Store “quente” de Float / sessão anterior
  → loadInboxCommand → conversations/set (ordem = array HTTP / push order)
  → selectConversations → orderedIds
  → Chat.tsx ainda pode re-sort em alguns filtros (conversationsToShow / leads / …)
  → WS conversation.updated / message.created
       → upsert atualiza lastMessageAt em byId
       → orderedIds: ou fica estagnado, ou só prepend se id novo
  → UI eventualmente re-sort / hydrate → “saltos”
```

### Causa raiz

1. **`orderedIds` não é SoT de “mais recente primeiro” após patches.**
   - `conversations/set` (sem fix): preserva ordem do array de entrada (push order), sem `sortDomainConversations`.
   - `conversations/upsert` (sem fix): se o id **já** está em `orderedIds`, **não reposiciona** quando `lastMessageAt` muda — só prepend se id novo.
2. Float / Bridge aquecem o Store com upserts lean (**TF3.1**) que atualizam At/preview **sem** reordenar.
3. `Chat.tsx` mantém `sortConversationsByLastMessage` em ramos da UI → após novo hydrate ou recompute, a lista “corrige” visualmente = **flash / embaralhamento**.
4. Sensação: “sempre reorganizando” em vez de **uma** ordem estável no Store desde o 1º frame útil.

Já existe helper: `sortDomainConversations` em `conversationSelectors.ts` (usado em testes F5.2 Floating) — **não** estava ligado de forma consistente ao reducer (e o working tree pode ter revertido TF5).

### Hipótese complementar (menor)

Warm cache legado (`readChatPageCache`) está **desligado** quando Store ON (`useLayoutEffect` early return). O shuffle é majoritariamente **Store orderedIds stale + sort UI tardio**, não IDB.

### Fix proposto (mínimo FE)

| # | Mudança | Arquivo |
|---|---|---|
| B1 | `conversations/set`: `orderedIds = sortDomainConversations(action.conversations).map(c => c.id)` | `actions.ts` |
| B2 | `conversations/upsert`: após merge, `orderedIds = sortDomainConversations(Object.values(byId)).map(...)` | `actions.ts` |
| B3 | Manter sort em `Chat.tsx` como **safety net** nesta sprint (remover em follow-up se métricas OK) | Observação OOS |

Custo: re-sort O(n log n) por upsert — n típico ≤ 200 (limite F4); aceitável para hotfix. Se paginar inbox (50), continua barato.

### Critério de aceite B

- [ ] Abrir `/chat` com Store já populado: lista já em ordem `lastMessageAt` DESC (pins primeiro, se aplicável).
- [ ] Inbound numa conversa antiga → sobe no topo **sem** “embaralhar e depois ajeitar”.
- [ ] Hydrate `loadInbox` não provoca salto perceptível vs. ordem pré-hydrate (ambos Sort DESC).

### Testes (já esboçados)

Mesmo arquivo TF5 — bloco **Bug B** (`set` unordered → orderedIds DESC; `upsert` move id para frente).

---

## Estado do repositório (contexto para o implementador)

| Artefato | Estado |
|---|---|
| `SPRINT_TF5_CLOSEOUT.md` | Existe e descreve o fix — **tratar como intent**, não como gate PASSED sem QA |
| `store.tf5.ws-message-dedupe.test.ts` | Spec executável do aceite |
| Commits `fix(chat): TF5…` | Podem existir no remote; **working tree local pode ter revertido** `actions` / `eventAppliers` / `normalizeChatMessage` |
| Validação | Rodar `vitest …/store.tf5.ws-message-dedupe.test.ts` — deve passar **após** reaplicar fix |

**Antes de re-deploy:** garantir que o tree contém A1–A3 e B1–B2 e que os testes TF5 passam.

---

## Plano de implementação (quando autorizado)

```
1. Restaurar / aplicar A1–A3 + B1–B2 (sem escopo BE)
2. vitest store.tf5.ws-message-dedupe.test.ts → green
3. Smoke manual: inbound único; open /chat ordem estável
4. Atualizar SPRINT_TF5_CLOSEOUT (gate = aguarda teste) + índice do plano Thread Surface
5. Push branch + redeploy staging/prod
```

Comando sugerido do usuário: `ok hotfix TF5` (após ler esta auditoria).

---

## Riscos / regressões

| Risco | Mitigação |
|---|---|
| Dedupe agressivo funde msgs diferentes com mesmo `provider_message_id` nulo | Só match se `externalMessageId` / `clientMessageId` **não-vazios** |
| Re-sort no upsert muda ordem pinida | `sortDomainConversations` já trata pin first (F5.2) |
| Safety net Chat.tsx sort diverge do Store | Mesma chave `lastMessageAt` DESC; depois unificar |

---

## Resumo executivo

| Bug | SoT quebrado | Fix |
|---|---|---|
| **A** Duplicatas + `--:--` | Append sem id estável / sem dedupe lógico | Normalize `message_id` + append dedupe |
| **B** Lista embaralha | `orderedIds` não segue `lastMessageAt` após set/upsert | `sortDomainConversations` no reducer |

**Não** é necessário otimizar paginação da inbox para fechar estes dois sintomas.
