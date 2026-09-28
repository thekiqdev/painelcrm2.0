# Sprint WR2 — Ticks por módulo + wire no motor

| Campo | Valor |
|-------|--------|
| **Sprint** | WR2 |
| **Gate** | Em execução → closeout |
| **OK produto** | 2026-07-20 (OK Sprint 2) |
| **Plano-mãe** | [PLANO_WHATSAPP_INSTANCE_PURPOSE_ROUTING.md](./PLANO_WHATSAPP_INSTANCE_PURPOSE_ROUTING.md) |

---

## Objetivo

Um tick por módulo do `notification_event_catalog` (exceto `invoices`, que continua em **Notificação de faturas**). Eventos daquele módulo usam a instância marcada.

---

## Entregas

| Item | Detalhe |
|------|---------|
| Serviço | `resolveModuleRoutedWhatsAppInstance` + `resolveWhatsAppRoutingForEventKey` |
| API | PATCH `moduleKey` + `useForModule`; GET inclui `modules[]` |
| Motor | `gateAndPublish`, agenda, retry — routing por módulo |
| UI | Switches por módulo no sheet |
| Testes | Resolve module + event_key |
