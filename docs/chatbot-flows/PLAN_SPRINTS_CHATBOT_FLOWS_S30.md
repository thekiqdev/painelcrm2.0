# Plano de sprints — Chatbot Flows S30 (Send avançado)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-06 |
| **Tipo** | Decisão de sprint (opcional / condicional) |
| **Base** | [`PLAN_SPRINTS_CHATBOT_FLOWS_S28.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S28.md) §8 · [`PLAN_SPRINTS_CHATBOT_FLOWS_S29.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S29.md) |
| **Nome** | **S30 — Send avançado** |
| **Status** | **SKIP / N/A** (não implementar neste sprint) |
| **Próximo** | **S31 feito** · delay embutido / sequência reaberto como **S34** ([`PLAN_SPRINTS_CHATBOT_FLOWS_S34.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S34.md)) |

---

## 1. Critério do plano (fonte da verdade)

S28 §8: implementar S30 **só se**, após S29, ainda faltar:

1. enviar para **outro** MSISDN **sem** trocar a conversa da sessão, ou
2. delay embutido no `send_message` (atalho UX; o nó `delay` já cobre).

Caso contrário: **adiar / cancelar**.

---

## 2. Avaliação (2026-08-06)

| Gap hipotético | Existe hoje? | Cobertura |
|----------------|--------------|-----------|
| Abrir/amarrar conversa por telefone (Woo → WhatsApp) | Sim (necessidade real) | **S29** `ensure_conversation` |
| Enviar texto / mídia na conversa da sessão | Sim | **`send_message`** (texto + `send_mode=media`, S19) |
| Pausar antes do próximo passo | Sim | **Nó `delay`** (S4; worker `waiting_delay`) |
| Destino alternativo (outro MSISDN na mesma sessão) | **Não** há pedido de produto nem fluxo de referência que exija isso | Modelo correto: 1 sessão ↔ 1 conversa; outro número = outro `ensure_conversation` / outra sessão |
| Delay embutido no send | Só atalho UX | Redundante com nó `delay` separado (fluxo Woo: send → delay → humano/fim) |

**Veredito:** após S29 + S29.1, **`send_message` + `delay` bastam**. Nenhum gap real que justifique código novo.

---

## 3. Decisão

| ID | Decisão |
|----|----------|
| **D30.1** | **S30 cancelado / skip** — não criar destino alternativo no send nem delay embutido |
| **D30.2** | Reabrir S30 (ou sprint dedicado) **somente** se surgir requisito explícito: template Meta HSM, destino off-session, ou UX unificada send+delay com aceite de produto |
| **D30.3** | **2026-08-11:** requisito de **sequência de mensagens + delay entre itens** no mesmo `send_message` → entregue em **S34** (não destino MSISDN; nó `delay` standalone mantido) |

---

## 4. Aceite (decisão)

- [x] Critérios S28 §8 avaliados honestamente pós-S29
- [x] Skip documentado (este arquivo + ponteiros no plano principal / S28 / S29)
- [x] **Nenhuma** feature inventada; sem alteração de runtime/UI para S30
- [x] S31 **não** misturado nesta entrega

---

## 5. O que **não** foi feito (proposital)

- Schema/UI de `to_phone` / destino alternativo em `send_message`
- Campo `delay_*` embutido no nó de mensagem
- Template Meta oficial / HSM (fora do critério S30; ver D29.2 / fase futura se pedido)
- Qualquer código ou teste novo sob o rótulo S30

---

## 6. Fluxo de referência (inalterado — S28 §10)

```
webhook_in
  → payload_map
  → ensure_conversation (phone={{order.phone}})
  → send_message
  → delay (opcional)
  → transfer_human / end
```

---

## 7. Próximo passo operacional

1. ~~Avaliar S30~~ → **skip** (D30.1).
2. Enfileirar **S31** (gatilho tag/kanban · opt-out `parar`/`sair`) em entrega separada → **feito** ([`PLAN_SPRINTS_CHATBOT_FLOWS_S31.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S31.md)).
3. Sequência send + delay embutido entre msgs → **S34 feito** ([`PLAN_SPRINTS_CHATBOT_FLOWS_S34.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S34.md)).
