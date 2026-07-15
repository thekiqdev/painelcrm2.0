# SPRINT_TF5_CLOSEOUT — WS dedupe + inbox order (hotfix)

| Campo | Valor |
|---|---|
| **Sprint** | TF5 (hotfix pós-TF4) |
| **Gate** | **CLOSED** (aguardando teste manual) |
| **Data** | 2026-07-15 |
| **Branch** | `feature/chat-ownership-thread-surface-tf4` |

---

## Resumo

Dois bugs de produção em superfície de chat, ambos **frontend / Domain Store** (sem BE):

| Bug | Sintoma | Fix |
|---|---|---|
| **A** | Um inbound WS (“oi”) gera várias bolhas; algumas com `--:--`; F5 normaliza | IDs estáveis (`message_id`) + flatten v2 + dedupe por `externalMessageId` / `clientMessageId` |
| **B** | Lista `/chat` “embaralha” e depois normaliza | `conversations/set` e `upsert` reescrevem `orderedIds` via `sortDomainConversations` |

---

## Bug A — duplicate bubbles

### Causa

- Backend emite `new_message` (nested `message.id`) **e** tenant `message.created` (flat `message_id`).
- Bridge aplica ambos no Store.
- `normalizeChatMessage` só lia `raw.id` → sem id → `temp-${uuid}` → append nunca deduplicava.
- Sem `sentAt` → `formatHour` → `--:--`.

### Entrega

1. `src/services/chat.ts` — `id: id ?? message_id`; `external_message_id` ← `provider_message_id`; `sentAt` aceita `Date`.
2. `eventAppliers.ts` — flatten payload v2 flat antes do map.
3. `actions.ts` `messages/append` — skip por `id`; merge se mesmo `externalMessageId` / `clientMessageId` (promove id se existente era `temp-`).

---

## Bug B — list shuffle

### Causa

Store hot (Float/WS) atualizava `lastMessageAt` sem reposicionar `orderedIds`; UI re-ordenava só após hydrate → flash.

### Entrega

1. `conversations/set` — `orderedIds` = sort DESC por `lastMessageAt` (pin first).
2. `conversations/upsert` — re-sort completo da lista no Store após merge.
3. `Chat.tsx` `conversationsToShow` sort **mantido** como safety net.

---

## Checklist de teste

### Bug A

1. Receber **uma** mensagem inbound no Float ou `/chat` → **uma** bolha (não N).
2. Horário da bolha **não** é `--:--` (quando o provider manda `sent_at`).
3. F5 não muda o número de bolhas daquela msg (já está estável).

### Bug B

1. Com Store quente, nova msg numa conversa antiga → conversa sobe **sem** flash/reordenção tardia.
2. Reload / hydrate não “salta” a lista de forma perceptível vs. estado pré-hydrate.

---

## Testes automatizados

`src/features/chat-core/store/store.tf5.ws-message-dedupe.test.ts`

- v2 `message_id` → id estável + Date → ISO `sentAt`
- flat `message.created` via `mapDomainEventToActions`
- nested então flat (mesmo lógico) → 1 bolha
- dedupe só por `externalMessageId` (temp → canonical)
- dedupe por `clientMessageId`
- `set` unordered → `orderedIds` DESC
- `upsert` At mais novo → id no topo

---

## Observações (não corrigidas)

- Remover sort de `conversationsToShow` no Chat (ainda safety net).
- Unificar emissão BE (`new_message` vs `message.created`) — fora de escopo FE.

---

## Próximo

Validação manual A+B; se OK, TF surface estável até novo plano.
