# Fase 3 — Eventos reais do Motor de Notificações da Plataforma

**Status da fase:** concluída.

---

## 1. Objetivo

Ligar **eventos transacionais reais** da plataforma ao núcleo técnico da Fase 2 (`platform_notification_*`, orquestrador, flags), **sem** misturar com o motor do tenant.

---

## 2. Escopo exato

- Publicação **após persistência confirmada** nos fluxos mapeados (via `setImmediate` para não bloquear a transação HTTP principal).
- Canal **WhatsApp** apenas.
- Respeito a **flags globais** e **piloto** por tenant.
- **Sem** e-mail, SMS, anúncios, UI Super Admin completa.

---

## 3. Eventos cobertos nesta fase

| `event_key` | Ligado |
|-------------|--------|
| `platform.account.created` | Sim |
| `platform.auth.login_link.issued` | **Não** (sem fluxo maduro) |
| `platform.plan.activated` | Sim |
| `platform.billing.charge.created` | Sim |
| `platform.billing.payment_confirmed` | Sim |

---

## 4. O que entra

- Serviço `platformBusinessNotifications.ts`: merge context, destinatário (admin mais antigo do tenant + fallback `billing_phone`), idempotência, chamada a `runPlatformTransactionalNotification`.
- Chave **`platform_notifications_business_events_enabled`** em `superadmin_settings` + cache + kill switch `PLATFORM_NOTIFICATIONS_BUSINESS_EVENTS_ENABLED`.
- Hooks nos módulos listados na secção “Ficheiros alterados”.

---

## 5. O que não entra

- `platform.auth.login_link.issued`.
- E-mail / SMS / campanhas.
- Alteração do domínio do motor do tenant.

---

## 6. Decisões reaproveitadas (Fase 2)

- Orquestrador, renderer strict, dispatcher WhatsApp, tabelas `platform_notification_*`, settings Super Admin em `/api/superadmin/platform-notifications/*`.

---

## 7. Estratégia de publicação

- **Pós-commit / pós-persistência:** `setImmediate` dispara o serviço de negócio; falhas de WhatsApp não revertem criação de conta/fatura.
- **Actor:** `{ type: 'system', source: 'platform_business_events' }`.
- **Conta criada:** `POST /api/auth/register/organization`, checkout `POST /api/plan-purchase` (tenant novo com utilizador), trial `postCompleteSignupTrial`.
- **Cobrança criada:** retornos de `subscribePlan` / `subscribeSeatAddon`, `POST .../tenants/:id/billing/charge`, job de renovação SaaS.
- **Pagamento confirmado:** `applyPaymentEvent` (webhook), `runPostPaidCleanupForTenantBilling` (polling), `executeTenantBillingPayWithCard` (cartão inline).
- **Plano ativado:** final do ramo principal de `activatePlanFromBilling` (exclui `seat_addon` e idempotência “já ativo com a mesma fatura”).

---

## 8. Idempotência

| Evento | `idempotency_key` |
|--------|-------------------|
| Conta criada | `platform:tenant:{tenantId}:account_created` |
| Cobrança criada | `platform:tenant_billing:{billingId}:charge_created` |
| Pagamento confirmado | `platform:tenant_billing:{billingId}:payment_confirmed` |
| Plano ativado | `platform:tenant:{tenantId}:plan_activated:{billingId}` |

---

## 9. Rollout (flags)

- `platform_notifications_enabled`
- `platform_notifications_business_events_enabled` (default **true** se chave ausente, como no motor do tenant)
- `platform_notifications_whatsapp_send_enabled`
- `platform_notifications_pilot_target_tenant_ids` (CSV)
- Env: `PLATFORM_NOTIFICATIONS_*` incl. `PLATFORM_NOTIFICATIONS_BUSINESS_EVENTS_ENABLED`

---

## 10. Merge fields e destinatário

- **Whitelist** respeitada (sem chaves extra no contexto — modo strict).
- **`auth.login_link`:** `{FRONTEND_URL}/login` (sem JWT no WhatsApp).
- **`platform.support_link`:** `PLATFORM_SUPPORT_URL` ou `FRONTEND_URL`.
- **`platform.name`:** `APP_PUBLIC_NAME` ou “PainelCRM”.
- **Destinatário:** primeiro `users` do tenant por `created_at`; telefone `whatsapp_number` ou `tenants.billing_phone`.

---

## 11. Evento pendente (documentado)

### `platform.auth.login_link.issued`

Não existe hoje um fluxo consolidado de emissão de link de login mágico para o admin do tenant. **Fase futura** quando houver API/serviço dedicado com expiração e auditoria.

---

## 12. Checklist de implementação

- [x] `platformBusinessNotifications.ts` + flag global + env
- [x] Hooks: conta, cobrança, pagamento, plano
- [x] Documentação e STATUS

---

## 13. Checklist de validação

- [x] `npm run build` (backend)
- [x] Idempotência por chave estável por evento/entidade
- [x] Motor do tenant não alterado (sem mudanças em `notification_*` do tenant)

---

## 14. Ficheiros criados ou alterados

**Novo**

- `packages/backend/src/services/platformNotifications/platformBusinessNotifications.ts`

**Alterados**

- `packages/backend/src/config/platformNotificationsEnv.ts`
- `packages/backend/src/services/platformNotifications/platformNotificationsGlobalSettingsService.ts`
- `packages/backend/src/services/platformNotifications/platformNotificationsRuntimeFlags.ts`
- `packages/backend/src/controllers/superadminPlatformNotificationsController.ts`
- `packages/backend/src/services/subscriptionService.ts`
- `packages/backend/src/controllers/registerOrganizationController.ts`
- `packages/backend/src/controllers/planPurchaseController.ts`
- `packages/backend/src/modules/payments/webhook/paymentDomainService.ts`
- `packages/backend/src/services/billingGatewayChargeService.ts`
- `packages/backend/src/services/customerBillingService.ts`
- `packages/backend/src/controllers/tenantsController.ts`
- `packages/backend/src/services/recurringBillingJobService.ts`
- `env.example`
- `docs/platform-notifications/README.md`, `STATUS.md`, este ficheiro

---

## 15. Riscos / pontos de atenção

- **Dois toques no mesmo pagamento:** `platform.billing.payment_confirmed` e `platform.plan.activated` podem ocorrer em sequência; aceite no MVP; consolidar mensagem numa fase posterior se necessário.
- **Webhook + cartão:** idempotência de `payment_confirmed` evita entrega duplicada.
- **Renovação:** nova fatura gera novo `charge_created` e, ao pagar, `payment_confirmed` / `plan.activated` conforme ramos de `activatePlanFromBilling`.
- **Cobrança sem link:** `billing.payment_link` pode ser vazio (gateway ausente ou metadata incompleta); texto deve permanecer aceitável.

---

## 16. Próxima fase sugerida (Fase 4)

- UI Super Admin para templates/overrides e fila (sobre APIs existentes).
- Evento `platform.auth.login_link.issued` quando existir fluxo real.
- Métricas/alertas e testes automatizados dos hooks.

---

## Secção de status

| Estado | Significado |
|--------|-------------|
| Pendente | Não iniciado |
| Em andamento | Implementação parcial |
| **Concluído** | **Fase 3 fechada** |

**Estado atual:** **Concluído.**
