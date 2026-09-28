# Sprint WR1 CLOSEOUT — Routing de faturas + chat

| Campo | Valor |
|-------|--------|
| **Sprint** | WR1 |
| **Gate** | **DONE** |
| **OK produto** | 2026-07-20 (OK Sprint 1) |
| **Plano-mãe** | [PLANO_WHATSAPP_INSTANCE_PURPOSE_ROUTING.md](./PLANO_WHATSAPP_INSTANCE_PURPOSE_ROUTING.md) |
| **Próxima** | WR2 — ticks por módulo (`READY`) |

---

## Veredito

Notificações de fatura passam a respeitar instância explícita do tenant. Chat continua via `enabled_in_chat` / conversa. Sem marca de fatura → fallback heurístico (compat).

---

## O que foi feito

| Item | Detalhe |
|------|---------|
| Migration | `296` + `migrationOrder` |
| Resolve | `resolveInvoiceRoutedWhatsAppInstance` |
| Dispatch | `chatInstanceId` opcional |
| Publish/retry | `invoice.*` usa routing |
| API | PATCH `useForInvoice` / GET `purpose-routing` |
| UI | Switches no sheet de detalhe |
| Testes | `whatsappInstanceRoutingService.test.ts` |

---

## Aceite

| Critério | Status |
|----------|--------|
| Instância marcada → invoice usa ela | **Pass** (código) |
| Só-chat não é preferida se outra marcada | **Pass** |
| Sem marca → fallback | **Pass** |
| Chat humano inalterado | **Pass** |

---

## Ops

Aplicar migration **296** no ambiente.
