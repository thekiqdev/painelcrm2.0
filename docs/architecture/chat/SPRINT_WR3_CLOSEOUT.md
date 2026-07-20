# Sprint WR3 CLOSEOUT — Sticky, badges e polimento

| Campo | Valor |
|-------|--------|
| **Sprint** | WR3 |
| **Gate** | **DONE** |
| **OK produto** | 2026-07-20 (OK Sprint 3) |
| **Plano-mãe** | [PLANO_WHATSAPP_INSTANCE_PURPOSE_ROUTING.md](./PLANO_WHATSAPP_INSTANCE_PURPOSE_ROUTING.md) |
| **Detalhe** | [SPRINT_WR3_STICKY_BADGES.md](./SPRINT_WR3_STICKY_BADGES.md) |
| **Próxima** | WR4 — seed automático (`DONE`) |

---

## Veredito

Retry WhatsApp do motor grava e reutiliza a instância da primeira tentativa. A lista mostra chips (Chat · Faturas · módulos). O detalhe avisa conexão desconectada com finalidades ativas e ausência de fatura dedicada.

---

## O que foi feito

| Item | Detalhe |
|------|---------|
| Migration | `297` + `migrationOrder` |
| Sticky | `setDispatchChatInstanceIfNull`; orchestrator + retry; órfã → routing atual |
| Dispatch | sucesso devolve `chatInstanceId` |
| Badges API | `listPurposeBadgesByInstance` em `listInstances` |
| UI | chips no card; alerts no sheet |
| Testes | `whatsappChannelDispatcher.dispatch.test.ts` (shape com `chatInstanceId`) |

---

## Aceite

| Critério | Status |
|----------|--------|
| Retry reutiliza instância sticky | **Pass** |
| Card mostra finalidades | **Pass** |
| Closeout documentado | **Pass** |

---

## Ops

Aplicar migration **297** no ambiente (`dispatch_chat_instance_id` em `notification_outbound_deliveries`).
