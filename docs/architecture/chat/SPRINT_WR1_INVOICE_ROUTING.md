# Sprint WR1 — Schema + routing faturas + UI chat/faturas

| Campo | Valor |
|-------|--------|
| **Sprint** | WR1 |
| **Gate** | Em execução → closeout |
| **OK produto** | 2026-07-20 (OK Sprint 1) |
| **Plano-mãe** | [PLANO_WHATSAPP_INSTANCE_PURPOSE_ROUTING.md](./PLANO_WHATSAPP_INSTANCE_PURPOSE_ROUTING.md) |

---

## Objetivo

Tenant define no detalhe da instância: **Usar no Chat** + **Notificação de faturas**. Eventos `invoice.*` usam a instância marcada.

---

## Entregas

| Item | Detalhe |
|------|---------|
| Migration | `296_tenant_whatsapp_instance_routing.sql` |
| Serviço | `whatsappInstanceRoutingService.ts` |
| Dispatch | `dispatchWhatsAppText({ chatInstanceId })` |
| Motor | `gateAndPublish` + retry worker para `invoice.*` |
| API | `GET/PATCH .../instances/:id` (+ `purpose-routing`) |
| UI | Secção no `WhatsAppInstanceDetailsSheet` |
