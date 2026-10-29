# Sprint OS-S6 — Visita técnica + Agenda ± Google — Notas

| Campo | Valor |
|-------|-------|
| **Status** | **FEITO** |
| **Data** | 2026-10-29 |
| **ADR** | [`ADR_OS_S0_DECISOES.md`](./ADR_OS_S0_DECISOES.md) (D5) |

## Entregas

### Migration
- `database/init/363_appointments_service_order_id.sql` — `appointments.service_order_id` + FK `service_orders.appointment_id`.
- Registada em `migrationOrder.ts` após `362`.

### Backend
- `serviceOrderVisitService.ts` — `scheduleServiceOrderVisit` (wrapper de `createAppointment` tipo `visit`).
- `POST /api/service-orders/:id/schedule-visit`
- Prefill: `client_id`, `responsible_user_id`, endereço de execução, título `Visita técnica — OS Nº N`.
- Draft → `scheduled` na primeira visita; bloqueio 409 se já houver `appointment_id`.
- GET detalhe inclui `appointment` (resumo sync/Google).

### Frontend
- Botão **Marcar visita técnica** + dialog (início/fim, Google, Meet).
- Seção Visita: status sync, **Ver na Agenda** (`/agenda?appointment_id=`), retry Google.

## Regras / pitfalls

| Tema | Comportamento |
|------|----------------|
| Google OAuth | Conta de **quem clica** (`req.userId`), não do técnico |
| Sem Google | Compromisso local; `sync_status=error` + warning (mesmo padrão Agenda) |
| 1 visita principal | v1: uma `appointment_id` por OS |
| Perms | `service_orders.edit` + `agenda.create` |

## Critérios de aceite

| Critério | Status |
|----------|--------|
| Visita na Agenda e no detalhe da OS | ✅ |
| Google off → só CRM | ✅ |
| Google on → tenta sync (erro visível + retry) | ✅ |

## Fora deste sprint

- Múltiplas visitas / técnicos (backlog)
- Hardening / testes (S7)
