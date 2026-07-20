# Sprint WI1 CLOSEOUT — Enforcement do limite de instâncias WhatsApp

| Campo | Valor |
|-------|--------|
| **Sprint** | WI1 |
| **Gate** | **DONE** |
| **OK produto** | 2026-07-20 (OK Sprint 1) |
| **Plano-mãe** | [PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md](./PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md) |
| **Próxima** | WI2 — preço por instância (`READY`) |

---

## Veredito

Quota de conexões WhatsApp do plano/override passa a ser **enforced na criação** (antes da UazAPI), exposta em `GET /api/me/tenant/limits` e refletida na UI de WhatsApp (contador + bloqueio + CTA Meu Plano).

---

## O que foi feito

| Item | Detalhe |
|------|---------|
| Gate create | `chatController.createInstance` → `checkTenantWhatsAppInstancesLimit` → 403 `WHATSAPP_INSTANCE_LIMIT_REACHED` |
| Mensagem | `formatWhatsAppInstancesLimitReachedMessage` |
| Limits API | `whatsapp_instances: { current, limit, allowed }` |
| FE types | `tenantLimits.ts` |
| UI | `WhatsAppSection`, `InstancesList`, `AddConnectionDialog` |
| Testes | `tenantLimitService.whatsapp.test.ts` |

---

## Critérios de aceite

| # | Critério | Status |
|---|----------|--------|
| A1 | Create no limite → 403; sem UazAPI | **Pass** (ordem preflight) |
| A2 | Create com folga → fluxo atual | **Pass** |
| A3 | Override SA respeitado via `getTenantLimit` | **Pass** (já existente) |
| A4 | `GET .../limits` com `whatsapp_instances` | **Pass** |
| A5 | UI contador + bloqueio + Meu Plano | **Pass** |
| A6 | Testes unitários | **Pass** |

---

## Fora (próximas sprints)

- Preço por instância → **WI2**
- Self-service add-on → **WI3**
- Renovação → **WI4**

Ops: planos ativos com `max_whatsapp_instances IS NULL` continuam ilimitados até preenchimento comercial.
