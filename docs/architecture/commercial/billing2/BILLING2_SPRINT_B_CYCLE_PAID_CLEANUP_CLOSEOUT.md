# Billing 2.0 — Sprint B Closeout (anti-duplicidade no ciclo)

| Campo | Valor |
|-------|-------|
| **Sprint** | B — paid cancela só cobranças abertas **deste ciclo** |
| **Data** | 2026-07-28 |
| **Status** | Implementada — aguardando smoke staging |
| **Auth Pix Auto** | **Intacta** (não cancela autorização BACEN/Asaas) |

## Problema

Com instrução Pix Automático (ou another charge) aberta na fatura, pagamento **manual** (outra tentativa / outro payment) liquidava a fatura sem cancelar a cobrança restante no Asaas → risco de débito duplicado no mesmo ciclo.

## Solução

No `paid` de `tenant_billing`:

1. Cancelar no gateway (`DELETE /payments/:id`) todas as cobranças **abertas do ciclo**, **exceto** o payment que liquidou  
2. Inclui: attempts irmãos + `gateway_reference_id` anterior na linha principal (ex. instrução Pix Auto sobrescrita)  
3. **Não** chamar `cancelPixAutomaticAuthorization` — próximo ciclo continua elegível se auth `active`

## Critérios de aceite

- [x] `cancelOpenTenantBillingCycleChargesAfterPaid` + wire em `applyPaymentEvent` / attempt / `runPostPaidCleanupForTenantBilling`
- [x] SaaS usa gateway global (`billingType: 'saas'`) no delete
- [x] Auth Pix Auto não é alterada neste fluxo
- [x] Testes unitários Sprint B
- [ ] Smoke: fatura com instrução Pix Auto + pago via boleto/PIX avulso → instrução cancelada no Asaas; auth permanece `active`
- [ ] Smoke: próximo ciclo ainda gera instrução se auth active

## Rollback

Código fail-open (erros de cancel só logam). Reverter o wire no paid se necessário; auth nunca foi tocada.

## Arquivos

- `packages/backend/src/services/billingGatewayChargeService.ts`
- `packages/backend/src/modules/payments/webhook/paymentDomainService.ts`
- `packages/backend/src/services/billingGatewayChargeService.sprintB.test.ts`
- Ops: [`BILLING2_PIX_AUTOMATIC_OPS.md`](./BILLING2_PIX_AUTOMATIC_OPS.md)

## Próximo

**Sprint C** — switch ON/OFF (SSOT na assinatura) em checkout / saas-pay / Meu plano + cancel auth só no OFF / cancel de plano.
