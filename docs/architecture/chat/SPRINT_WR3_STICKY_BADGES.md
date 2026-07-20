# Sprint WR3 — Sticky instance, badges e polimento

| Campo | Valor |
|-------|--------|
| **Sprint** | WR3 |
| **Gate** | Em execução após **OK Sprint 3** (2026-07-20) |
| **Plano-mãe** | [PLANO_WHATSAPP_INSTANCE_PURPOSE_ROUTING.md](./PLANO_WHATSAPP_INSTANCE_PURPOSE_ROUTING.md) |

---

## Objetivo

1. Retry outbound reutiliza a mesma `chat_instance_id` da primeira tentativa.
2. Card da lista mostra chips de finalidade sem abrir o detalhe.
3. Avisos no sheet se a conexão está desconectada com finalidades ativas / sem fatura dedicada.

---

## Entregas

| Item | Detalhe |
|------|---------|
| Migration | `297_notification_outbound_dispatch_chat_instance.sql` |
| Sticky | `dispatch_chat_instance_id` + orchestrator / retry worker |
| Badges | `listPurposeBadgesByInstance` → `purpose_badges` em `listInstances` |
| UI | Chips no `WhatsAppInstanceCard`; alerts no sheet |
| Docs | Closeout + tracker DONE |
