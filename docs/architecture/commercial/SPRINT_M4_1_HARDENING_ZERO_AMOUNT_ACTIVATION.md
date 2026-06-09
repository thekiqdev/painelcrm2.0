# Sprint M4.1 — Hardening Zero Amount Activation

## Objetivo

Reforços arquiteturais ao Sprint M4 antes do Partner Program (M5), sem alterar comportamento funcional aprovado.

- Idempotência forte (1 billing = 1 ativação)
- Auditoria e logs estruturados
- Metadata comercial na assinatura para MRR, Forecast e Parceiros

---

## Ajuste 1 — Idempotência forte

**Arquivo:** `packages/backend/src/commercial/zeroAmountSettlementService.ts`

### Regras

1. Se `billing.status === 'paid'` → `{ settled: false, reason: 'already_paid' }` (sem `activatePlanFromBilling`)
2. Se `tenant.activated_billing_id === billing.id` → `{ settled: false, reason: 'already_activated' }`
3. Log `[zero_amount_settlement_skip]` com `{ billingId, reason }`
4. Re-check pós-marcação `paid` para corrida entre retries/webhook

### Resultado

Checkout + retry + webhook + superadmin não disparam `activatePlanFromBilling` duas vezes para a mesma fatura.

---

## Ajuste 2 — Commercial metadata na subscription

**Arquivo:** `packages/backend/src/commercial/subscriptionCommercialMetadata.ts`

Persistência em `subscriptions.metadata` (JSONB existente — sem migration):

```json
{
  "commercial": {
    "commercial_source": "waive | catalog | tenant_override | zero_amount",
    "activation_type": "zero_amount | paid",
    "override_id": "...",
    "billing_id": "...",
    "updated_at": "..."
  }
}
```

### Pontos de integração

- `ensureSaasSubscriptionAfterPaidActivation()` em `subscriptionService.ts`
- Após `persistContractSnapshotFromPaidBilling()`

### Atualização futura

Nova ativação paga (R$99, R$59, etc.) sobrescreve o bloco `commercial` na assinatura ativa.

---

## Testes

| Arquivo | Cenários |
|---------|----------|
| `zeroAmountSettlementService.test.ts` | already_paid, already_activated, retry único |
| `subscriptionCommercialMetadata.test.ts` | waive, catalog, tenant_override |

---

## Compatibilidade

- M1–M4: overrides, UI comercial, analytics
- M5: Partner Program, Revenue Forecast, MRR contratado, white labels
- Lifecycle / Trial Recovery / Analytics: sem alteração de middleware ou jobs

---

## Referências

- `SPRINT_M4_ZERO_AMOUNT_ACTIVATION_AND_WAIVE_REACTIVATION.md`
- `AUDIT_WAIVE_OVERRIDE_ACTIVATION.md`
- `AUDIT_TENANT_COMMERCIAL_OVERRIDES.md`
