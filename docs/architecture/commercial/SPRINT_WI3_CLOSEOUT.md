# Sprint WI3 CLOSEOUT — Instance addon self-service

| Campo | Valor |
|-------|--------|
| **Sprint** | WI3 |
| **Gate** | **DONE** |
| **OK produto** | 2026-07-20 (OK Sprint 3) |
| **Plano-mãe** | [PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md](./PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md) |
| **Próxima** | WI4 — renovação / schedule / polimento (`READY`) |

---

## Veredito

Add-on de conexões WhatsApp está operacional no mesmo espírito do seat addon: preview → checkout SaaS → activate sobe `max_whatsapp_instances_override` sem misturar campos de assentos.

---

## O que foi feito

| Item | Detalhe |
|------|---------|
| Migration | `294_instance_addon_billing.sql` + `migrationOrder` |
| Pró-rata | `calculateInstanceAddonProrata` + teste unitário |
| Serviço | `tenantInstanceCommercialService` |
| Activate | `activateInstanceAddonFromBilling` em `subscriptionService` |
| Rotas | preview + checkout em `myTenantPlanRoutes` |
| UI hub | `MeuPlano` — cartão Conexões WhatsApp |
| Checkout | `InternalBillingCheckout` + payload `instance_addon_additional_instances` |
| Hub cobranças | `COMMERCIAL_BILLING_REASONS` inclui `instance_addon` |
| Checkout presentável | `COMMERCIAL_SAAS_BILLING_REASONS` inclui `instance_addon` |

---

## Critérios de aceite

| # | Critério | Status |
|---|----------|--------|
| Preview pró-rata | **Pass** |
| Activate sobe override | **Pass** (código) |
| Sem pagamento → sem override | **Pass** (pending pointer + activate só no paid) |
| Histórico `instance_addon` | **Pass** |
| Alias `/planos` | **Skip** (opcional) |

---

## Ops

Aplicar migrations `293` e `294` no ambiente antes de testar compra self-service em produção.

---

## Fora de escopo (WI4)

- Renovação SaaS incluindo extras de instâncias no valor do ciclo
- Agendar redução de conexões no próximo ciclo
- Polimento SA / mensagens unificadas
