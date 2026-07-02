# Billing Date Audit — Sprint 4.1I

Auditoria de formatos de data nos caminhos de **billing / renovação CRM**.  
Regra: persistência e SQL usam apenas **YYYY-MM-DD** ou **ISO8601** via `normalizeBillingDate()`.

## Normalizador canónico

| Arquivo | Função |
|---------|--------|
| `packages/backend/src/utils/billingSafeDate.ts` | `normalizeBillingDate()`, `normalizeBillingDateOrEmpty()` |
| `packages/backend/src/utils/billingCycleKey.ts` | `normalizeBillingCycleKeyYmd()` — delega ao normalizador |
| `src/lib/subscriptionRenewalRecovery.ts` | `normalizeBillingDate()` (frontend) |

## Caminhos de billing auditados (SQL / motor)

| Arquivo | Linha (aprox.) | Função | Caller / notas |
|---------|----------------|--------|----------------|
| `billingSafeDate.ts` | 56+ | `normalizeBillingDate` | **Entrada única** worker, manual, dual-write |
| `billingCycleKey.ts` | 14+ | `normalizeBillingCycleKeyYmd` | `recurringBillingJobService`, `billingManualRenewalService` |
| `subscriptionCyclesDualWriteService.ts` | 123+ | `upsertCycleRow` | `$3::date` — cycleDate via `normalizeBillingCycleKeyYmd` |
| `subscriptionCycleRepairService.ts` | 28+ | `repairCyclesTable` | Auto-repair ao abrir assinatura |
| `billingManualRenewalService.ts` | 683+ | `manualGenerateRenewalNow` | Geração manual — sem bloqueio de worker |
| `renewalDiagnosisService.ts` | 139+ | `assessManualGenerateUnblocked` | Só bloqueia se invoice já existe |
| `recurringBillingJobService.ts` | 356+ | `insertOrReactivateRenewalJob` | Reativa `failed`/`cancelled` |
| `subscriptionTimelineUx.ts` | 253+ | `resolveOperationalState` | UX: `failed` recuperável → `awaiting_generation` |
| `crmSubscriptionsService.ts` | 351+ | `getCrmSubscriptionDetail` | `repairRecoverableSubscriptionCycles` antes da timeline |

## Padrões proibidos em caminhos de billing

Busca em `packages/backend/src/services/*billing*`, `*subscription*`, `*renewal*`, `workerCrm*`:

| Padrão | Encontrado em billing? | Ação |
|--------|------------------------|------|
| `Date.toString()` | Não em caminhos de persistência | `billingCycleKey` rejeita `"Tue Jun 30"` |
| `toDateString()` | Não | — |
| `toUTCString()` | Não | — |
| `toLocaleDateString()` | Não em motor billing | Apenas notificações/PDF (fora do escopo) |
| `String(new Date)` | Não em `::date` | Logs usam `toISOString()` |
| `slice(0,10)` cego em Date string | Corrigido em 4.1H/4.1I | `normalizeBillingDate` |

## Usos seguros (UTC YMD explícito)

| Arquivo | Função | Formato |
|---------|--------|---------|
| `recurringBillingJobService.ts` | `advanceDueYmd` | `getUTCFullYear/Month/Date` → YMD |
| `subscriptionService.ts` | `calculateNextBillingDate` | UTC YMD |
| `billingSubscriptionService.ts` | `toYmd` | `safeParseYmd` |
| `financialRecurringDateUtils.ts` | helpers | `getUTCDate` padding |

## Usos fora do motor (não alterados — display only)

| Arquivo | Linha | Função | Notas |
|---------|-------|--------|-------|
| `dashboardController.ts` | 1235+ | charts | `toLocaleDateString` — UI dashboard |
| `contractSignedPdfBuilder.ts` | 220 | PDF | display pt-BR |
| `appointmentTransactionalNotifications.ts` | 46 | notificações | display |

## Fluxos validados

- Worker automático → `cycle_key` via `normalizeBillingCycleKeyYmd`
- Retry → job reativado; ciclo `pending` se recuperável
- Generate Now → `assessManualGenerateUnblocked`; reativa job `completed` sem invoice
- Advance Cycle / patch vencimento → `billingSubscriptionService` YMD
- SubscriptionCyclesDualWrite → `pending` em falha recuperável (≥ hoje)
- Auto-repair ao abrir detalhe → `failed` → `pending`

## Definition of Done (datas)

- [x] `normalizeBillingDate()` único no backend
- [x] `Date.toString()` nunca chega a `::date`
- [x] Repair automático de ciclos `failed` recuperáveis
- [x] Geração manual independente do worker

_Gerado: Sprint 4.1I_
