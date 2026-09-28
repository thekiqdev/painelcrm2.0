# Billing State Machine Normalization — Sprint 4.2C

## Objetivo

Uma **única máquina de estados oficial** para Billing na camada Runtime/UX, eliminando interpretações divergentes entre Calendário, Histórico, Sidebar e Próxima Cobrança.

## Módulo

| Camada | Arquivo |
|--------|---------|
| Frontend | `src/lib/billingStateMachine.ts` |
| Backend | `packages/backend/src/billingRuntime/billingStateMachine.ts` |
| Auditor | `packages/backend/src/billingPlatform/audit/stateMachine/billingStateMachineAuditor.ts` |

## API pública

- `resolveBillingCycleState()` — estado canônico do ciclo
- `resolveFinancialEventState()` — estado a partir de evento financeiro
- `resolveHistoryRowState()` — histórico + `showGenerateButton`
- `resolveCalendarState()` — visual do calendário
- `normalizeDetailForBillingStateMachine()` — normalização antes dos eventos
- `assertBillingStateMachine()` — assertions de runtime

## Regras proibidas

1. **Cancelada** sem `invoice_id` → proibido (vira **Prevista**)
2. Evento `invoice_cancelled` sem invoice → proibido
3. Botão **Gerar cobrança** oculto com competência elegível → proibido
4. Assinatura ativa sem competência futura → corrigido via `upcoming_cycle`
5. Datas `NaN-NaN-NaN` → rejeitadas por `normalizeBillingDate()`

## Mapeamento principal

| Condição | Estado | Label |
|----------|--------|-------|
| Sem invoice, assinatura ativa, data futura | `awaiting_generation` | Prevista |
| `pending` / `skipped` recuperável sem invoice | `awaiting_generation` | Prevista |
| Invoice emitida, não paga | `pending_invoice` | Pendente |
| Invoice paga | `paid` | Pago |
| Invoice cancelada | `cancelled` | Cancelada |
| Invoice reembolsada | `refunded` | Reembolsada |

## Skipped recuperável

`completed_no_invoice_no_eligible_items` e variantes → **Prevista** (não Cancelada).

## Pipeline de geração

Botão **Gerar cobrança** → `generateRenewalNow()` (pipeline existente, sem novo endpoint).

## Certificação

```bash
cd packages/backend
npm run billing:production-validation
```

Artefato: `storage/debug/billing-production/billing-state-machine-report.json`

## Testes

```bash
npx vitest run src/lib/billingStateMachine.test.ts
cd packages/backend && npm test -- src/billingRuntime/billingStateMachine.test.ts
```
