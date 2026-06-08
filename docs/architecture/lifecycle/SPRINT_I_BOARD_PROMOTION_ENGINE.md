# Sprint I — Board Promotion Engine

**Data:** 2026-06-05  
**Status:** Implementado — promoção controlada por feature flag (default OFF)

---

## 1. Objetivo

Primeiro mecanismo real de **promoção de cards** usando o Lifecycle Router (Sprint G/H). Eventos lifecycle resolvem rota, localizam card existente, validam destino e — quando habilitado — movem o card de forma **idempotente**, com auditoria completa.

**Fora de escopo (inalterado):** sync legado de aquisição, billing, automações, workflow runtime, Phase2, Ops Kanban Foundation.

```text
Lifecycle Event
      ↓
resolveLifecycleRoute()
      ↓
findLifecycleCardForLead()
      ↓
resolveLifecycleDestinationColumn()
      ↓
move (se OPS_LIFECYCLE_PROMOTION_ENABLED=true)
      ↓
ops_lifecycle_transitions (sempre)
```

---

## 2. Módulos novos

| Arquivo | Responsabilidade |
|---------|------------------|
| `lifecyclePromotionService.ts` | `promoteLifecycleCard`, resolução de card/coluna, move cross-board |
| `lifecyclePromotionRepository.ts` | `insertLifecycleTransition` |
| `lifecyclePromotionConfig.ts` | `isOpsLifecyclePromotionEnabled()` |

---

## 3. Feature flag

```env
OPS_LIFECYCLE_PROMOTION_ENABLED=false
```

| Valor | Comportamento |
|-------|---------------|
| `false` (default) | Resolve, valida, **grava auditoria**, **não move** (`promotion_disabled`) |
| `true` | Move efetivamente quando destino difere da posição atual |

Pode ser habilitado em runtime sem deploy adicional (variável de ambiente).

---

## 4. Auditoria — `ops_lifecycle_transitions`

Migration: `database/init/265_ops_lifecycle_transitions.sql`

| Campo | Descrição |
|-------|-----------|
| `id` | UUID |
| `created_at` | Timestamp |
| `acquisition_lead_id` | Lead (opcional) |
| `tenant_id` | Tenant (opcional) |
| `card_id` | Card movido ou candidato |
| `event_type` | Ex.: `subscription.activated` |
| `source_board_id` / `source_column_id` | Origem |
| `destination_board_id` / `destination_column_id` | Destino resolvido |
| `result` | Status da promoção |
| `correlation_id` | Rastreio |
| `metadata_json` | `source`, `reason`, `promotion_enabled`, rota |

A migration também garante colunas canônicas de destino nos boards (Provisionado, Onboarding concluído, Novo Cliente, Trial expirado, Cancelado, Novo Lead).

---

## 5. Resultados possíveis

| `result` | Significado |
|----------|-------------|
| `moved` | Card movido com sucesso |
| `already_at_destination` | Idempotência — já no destino |
| `card_not_found` | Sem card para o lead/tenant (sem erro) |
| `board_not_found` | Board canônico ausente |
| `column_not_found` | Coluna de destino ausente |
| `promotion_disabled` | Flag OFF — auditado, não movido |
| `route_unmatched` | Evento sem rota no router |
| `migration_required` | Coluna `acquisition_lead_id` ausente (260) |
| `no_actor` | Sem usuário sistema para RLS |
| `error` | Falha no UPDATE |

---

## 6. Integrações

| Evento | Ponto | Arquivo |
|--------|-------|---------|
| `subscription.activated` | `activatePlanFromBilling` | `subscriptionService.ts` |
| `trial.expired` | `expireTrialsPastDue` | `subscriptionService.ts` |
| `subscription.cancelled` | `cancelSubscription` (immediate) | `billingSubscriptionService.ts` |
| `subscription.cancelled` | `expireCancelledSubscriptions` | `billingSubscriptionService.ts` |
| `onboarding.completed` | `completeWizardWhatsappStep` | `acquisitionOnboardingWizardService.ts` |
| `onboarding.completed` | `skipWizardWhatsappStep` | `acquisitionOnboardingWizardService.ts` |
| `onboarding.started` | `provisionWorkspaceFromSession` | `acquisitionProvisioningService.ts` |

Shadow observers (Sprint G/H) permanecem — promoção é camada adicional.

---

## 7. Logs

Prefixo: `[lifecycle_promotion]`

```json
{
  "event": "subscription.activated",
  "cardId": "...",
  "fromBoard": "Aquisição",
  "fromColumn": "Trial iniciado",
  "toBoard": "Expansão",
  "toColumn": "Novo Cliente",
  "result": "moved"
}
```

---

## 8. Rotas utilizadas (Lifecycle Router — única fonte)

| Evento | Board | Coluna |
|--------|-------|--------|
| `onboarding.started` | Onboarding | Provisionado |
| `onboarding.completed` | Onboarding | Onboarding concluído |
| `subscription.activated` | Expansão | Novo Cliente |
| `trial.expired` | Reativação | Trial expirado |
| `subscription.cancelled` | Reativação | Cancelado |

Nenhuma regra hardcoded adicional no promotion engine.

---

## 9. Testes

`packages/backend/src/lifecycle/lifecyclePromotionService.test.ts`

- Move com sucesso (flag ON)
- Card inexistente
- Board inexistente
- Coluna inexistente
- Idempotência (`already_at_destination`)
- Feature flag OFF (audita, não move)
- Helpers `findLifecycleCardForLead` e `resolveLifecycleDestinationColumn`

---

## 10. Critérios de aceite

1. Com flag OFF, nenhum card é movido.
2. Auditoria gravada em todos os caminhos.
3. Lifecycle Router continua única fonte de rotas.
4. Nenhuma automação executada nesta sprint.
5. Comportamento legado inalterado.
6. Habilitável por env sem redeploy de código.
7. Compatível com Sprint G e H.
