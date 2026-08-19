# Plano de sprints — Chatbot Flows S34 (Sequência em `send_message`)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-11 |
| **Tipo** | Entrega de sprint |
| **Base** | [`PLAN_SPRINTS_CHATBOT_FLOWS.md`](./PLAN_SPRINTS_CHATBOT_FLOWS.md) · [`PLAN_SPRINTS_CHATBOT_FLOWS_S32.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S32.md) · [`PLAN_SPRINTS_CHATBOT_FLOWS_S30.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S30.md) |
| **Nome** | **S34 — Sequência de mensagens no nó `send_message` + delay por mensagem** |
| **Status** | **Feito** |
| **Próximo** | **S35** ([`PLAN_SPRINTS_CHATBOT_FLOWS_S35.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S35.md)) |

---

## 1. Meta

Permitir que um único nó `send_message` envie **várias mensagens** (texto e/ou mídia), **uma a uma**, com **delay opcional entre cada** — sem encadear vários nós `send_message` + `delay`.

Reabre o atalho UX de “delay embutido” que o **S30** tinha skipado (só o caso sequência + espera entre itens; **não** destino off-session / outro MSISDN).

---

## 2. Decisões

| ID | Decisão |
|----|----------|
| **D34.1** | Evoluir o tipo existente `send_message` — **não** criar nó novo |
| **D34.2** | Schema legado intacto: sem `messages` ou 1 item equivalente aos campos root (`text` / `media_*`) |
| **D34.3** | Runtime: cursor na sessão (`_send_message.*`); após cada item, se há próximo e `delay_after.amount > 0` → `waiting_delay` (mesmo worker do nó `delay`); retoma **no mesmo nó** |
| **D34.4** | Delay 0: envia o próximo na mesma passagem; tetos: **máx. 20 msgs/nó** e **máx. 10 sends sem pause por tick** (burst → delay 1s) |
| **D34.5** | Nó `delay` standalone **permanece**; destino outro MSISDN **fora** de escopo |
| **D34.6** | UI: lista +/− / reordenar; texto\|mídia (picker Media Library S33.2); delay antes da próxima; badge canvas `N msgs` |
| **D34.7** | Simulador: mostra a sequência (auto-resume de delay como hoje) |

---

## 3. Schema

```ts
messages?: Array<{
  id: string;
  send_mode: 'text' | 'media';
  text?: string;
  media_url?: string;
  media_asset_id?: string;
  media_asset_label?: string;
  media_type?: 'image' | 'document' | 'audio';
  caption?: string;
  filename?: string;
  /** Espera antes da PRÓXIMA mensagem (ignorado no último item). */
  delay_after?: { amount: number; unit: 'seconds' | 'minutes' | 'hours' };
}>
```

- `messages` opcional, **1–20** itens quando presente.
- Sem `messages` / array vazio → validação e runtime usam campos root (comportamento atual).
- Item: mesmas regras text vs media do envio único; `delay_after.amount` ∈ 0…99999 (`0` = sem pausa).

---

## 4. Runtime

1. Resolver lista efetiva (`resolveSendMessageItems`).
2. Ler cursor se `_send_message.node_id ===` nó atual; senão cursor = 0.
3. Enviar item `cursor`; avançar cursor.
4. Se há próximo:
   - `delay_after > 0` → action `delay` + `status: waiting_delay` + `currentNodeId` no `send_message`.
   - senão, se burst ≥ 10 → delay forçado 1s (mesmo path).
   - senão → próximo item na mesma passagem.
5. Fim da lista → limpar cursor → edge `default`.
6. `resumeFromDelay`: se nó atual é `send_message`, reativa e **continua** a sequência; se é `delay`, comportamento legado (avança edge).

---

## 5. UI / simulador

| Peça | Comportamento |
|------|----------------|
| **Painel** | Lista de mensagens; +/−; setas reordenar; por item: texto ou mídia (picker); “Espera antes da próxima” |
| **Canvas** | Preview + badge `N msgs` quando N > 1 |
| **Simulador** | Emite cada `send_text` / `send_media`; delays auto-resumidos |

---

## 6. Aceite

- [x] Publicar nó legado (só `text` / `media_*`) sem regressão
- [x] Nó com 2+ mensagens envia em ordem; `delay_after` pausa e retoma no mesmo nó
- [x] Delay 0 envia burst na mesma passagem (respeitando teto)
- [x] Badge `N msgs` no canvas; painel lista +/− / reorder
- [x] Simulador mostra sequência
- [x] Nó `delay` standalone inalterado
- [x] Testes schema + runtime sequência
- [x] Docs/ponteiros atualizados; **sem** destino MSISDN alternativo

---

## 7. Definition of Done

- [x] Plano S34 + ponteiros (principal / S30 / S31 / S32)
- [x] Schema BE + FE (`graphValidation` / `nodeCatalog`)
- [x] Runtime BE + espelho FE + resume delay em `send_message`
- [x] UI painel + preview/badge
- [x] Import estrangeiro aceita `messages` quando presente
- [x] Testes unitários passam
- [x] Aceite §6 marcado

---

## 8. Fora de escopo

- Destino outro MSISDN / off-session
- Remover ou fundir o nó `delay`
- Template Meta HSM
- Delay embutido genérico fora da sequência (só `delay_after` entre itens)

---

## 9. Próximo passo operacional

1. Validar manualmente no editor: 3 msgs (texto + mídia + texto) com delay 5s entre 1→2.
2. Publicar e testar no canal (worker `waiting_delay`).
3. Próximo produto: **S36** — [`PLAN_SPRINTS_CHATBOT_FLOWS_S36.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S36.md).
