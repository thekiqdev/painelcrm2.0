# Sprint P0-D — Retomada de cadastro (Recovery & Resume)

## Escopo

Correção definitiva de travamentos e dessincronia no fluxo `/cadastro` para leads existentes. Sem alterações em Ops Kanban, O1/O2, workflows, WhatsApp, billing ou Activation Center.

## Entregas

| # | Entrega | Implementação |
|---|---------|---------------|
| 1 | URL fonte de verdade | `resolveWizardStepFromLead` + `useEffect` em `AcquisitionSignupFlow.tsx` |
| 2–3 | Reidratação + plano | GET `/api/public/acquisition/leads/:id` + `planIdFromLeadAndParams` |
| 4 | Hardening estágios | `acquisitionLeadReconciliationService.ts` + `resolveAcquisitionResume` |
| 5–6 | `resume_verified` + navegação segura | `shouldShowResumeBanner` + `continue_lead` sem `signup/step` |
| 7 | Leads históricos | `reconcileHistoricalAcquisitionLeads` + script `reconcileAcquisitionLeads.ts` |
| 8 | Logs | `[acquisition-resume]` em `acquisitionResumeLogger.ts` |

## Logs

- `resume_detected` — contact/resolve e GET lead
- `resume_reconciled` — estágio corrigido
- `resume_redirect` — GET lead com destino fora de `/cadastro`

## Testes

```bash
cd packages/backend
npx vitest run src/acquisition/acquisitionResumeService.test.ts
npx vitest run src/acquisition/acquisitionLeadReconciliationService.test.ts
npx vitest run src/acquisitionSignupResume.p0b1.test.ts
```

## Reconciliação histórica (ops)

```bash
cd packages/backend
npx tsx src/scripts/reconcileAcquisitionLeads.ts --limit=500
```
