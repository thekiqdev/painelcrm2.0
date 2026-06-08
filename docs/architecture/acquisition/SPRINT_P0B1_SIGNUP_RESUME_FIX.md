# Sprint P0-B.1 — Correção da retomada de cadastro

## Problema

`navigate(/cadastro?step=conversion)` não remontava o wizard; `stepIndex` ficava em 0.

## Solução

| Correção | Implementação |
|----------|----------------|
| StepIndex reativo | `useEffect` em `params` + `resolveWizardStepIndex()` |
| Plano do lead | `GET /leads/:id` → `form.plan_id` |
| Hardening | `normalizeResumeNavigation()` — conversion sem plano → `step=plan` |
| Hidratação | `resumeHydrating` até lead na URL carregar |
| Retomada inline | `handleNext` busca lead, normaliza path, `setStepIndex` + `navigate` |

## Testes

```bash
cd packages/backend && npx vitest run src/acquisitionSignupResume.p0b1.test.ts
```

## Escopo

Somente frontend `/cadastro`. Sem alterações em Ops Kanban, outbox, O1.
