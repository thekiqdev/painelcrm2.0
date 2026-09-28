# Sprint WI2 CLOSEOUT — Preço por instância WhatsApp no catálogo

| Campo | Valor |
|-------|--------|
| **Sprint** | WI2 |
| **Gate** | **DONE** |
| **OK produto** | 2026-07-20 (OK Sprint 2) |
| **Plano-mãe** | [PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md](./PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md) |
| **Próxima** | WI3 — instance_addon self-service (`READY`) |

---

## Veredito

Catálogo passa a gravar **`price_per_instance_cents`** por intervalo. Super Admin edita valor por conexão extra (standard + custom). Snapshot `subscriptions.contracted_price_per_instance_cents` preparado; **billing/checkout ainda não usam** (WI3).

---

## O que foi feito

| Item | Detalhe |
|------|---------|
| Migration | `293_plan_interval_prices_price_per_instance.sql` |
| migrationOrder | entrada 293 |
| API | `plansController` SELECT/INSERT com `price_per_instance_cents` |
| UI SA | `SuperAdminPlans` — R$/conexão (standard + custom) |
| Snapshot | coluna `contracted_price_per_instance_cents` (sem wiring) |
| Testes | `plansController.pricePerInstance.test.ts` |

---

## Critérios de aceite

| # | Critério | Status |
|---|----------|--------|
| Grava/lê por intervalo | **Pass** |
| NULL/vazio = não vendável | **Pass** |
| Sem regressão preço/user | **Pass** (campo adicional) |

---

## Ops

Aplicar migration `293` no ambiente antes de testar o Super Admin em produção.
