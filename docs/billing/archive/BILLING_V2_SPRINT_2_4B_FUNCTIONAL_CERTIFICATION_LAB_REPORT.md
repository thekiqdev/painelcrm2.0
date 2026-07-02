# BILLING ENGINE V2 — Sprint 2.4B — Functional Certification Lab

**Data:** 2026-06-26  
**Modo:** CERTIFICATION LAB — LOCAL ONLY — Nenhuma alteração em produção

---

## Resumo

Criado o **Functional Certification Lab** — laboratório definitivo de homologação do Billing Engine V2 antes da ativação.

Responde:

> **"Existe algum cenário conhecido onde o Billing Engine V2 gere uma cobrança incorreta?"**

Com fixtures alinhadas e pipeline completo por cenário, a resposta esperada após execução do lab é **NÃO**.

---

## Princípio

O laboratório **não altera** regras de negócio, Billing Plan, Items, Projection, Consistency, Shadow ou Simulator.

Reutiliza exclusivamente os módulos V2 existentes. Falhas devem ser corrigidas no módulo responsável — **nunca** com exceções no lab.

---

## Estrutura

```
packages/backend/src/billingCertificationLab/
  types.ts
  billingGoldenDataset.ts          — Golden Dataset permanente (48 cenários)
  billingScenarioFactory.ts        — BillingScenarioFactory
  billingScenarioRunner.ts         — BillingScenarioRunner
  billingScenarioAssertions.ts     — BillingScenarioAssertions
  billingRegressionSuite.ts        — BillingRegressionSuite
  billingStressRunner.ts           — BillingStressRunner
  billingScenarioReporter.ts       — BillingScenarioReporter
  billingFunctionalMetrics.ts      — BillingFunctionalMetrics
  labTenantGates.ts                — tenant gates perfeitos (lab)
  index.ts
  billingCertificationLab.test.ts

packages/backend/src/scripts/runBillingCertificationLab.ts
```

---

## Pipeline por cenário

Cada cenário executa (in-memory, sem DB):

1. `BillingExecutionContext` (factory)
2. `BillingProjectionEngine.project()`
3. `BillingConsistencyValidator.validateFromContext()`
4. `RenewalComparisonService.compareWithProjection()` (shadow)
5. `analyzeMigrationImpact` + `resolveSimulationRecommendation`
6. Cutover gates (lab fixtures)
7. `buildStageSummaries` + `resolveCertificationDecision`

---

## Golden Dataset — 48 cenários

| Grupo | Qtd | Exemplos |
|-------|-----|----------|
| A — Recorrência/plano | 20 | mensal, anual, descontos, impostos, upgrade, trial, pró-rata |
| B — Gateway/notificações | 8 | sem gateway, WhatsApp, email, recusa simulada |
| C — Operacional/datas | 12 | scheduler, worker, fevereiro, ano bissexto, timezone |
| D — Stress/concorrência | 8 | paralelo, idempotência, duplo clique, dois workers |

Stress volumes adicionais: **100, 500, 1000, 5000** iterações via `BillingStressRunner`.

---

## Assertions obrigatórias

Por cenário: projection, shadow, consistency, simulator, cutover, certification, invoice, items, subtotal, total, impostos, descontos, datas, gateway, notificações, timeline, history, definition hash, revision, execution context.

---

## Relatórios

Gerados em `storage/debug/billing-certification-lab/`:

| Arquivo | Conteúdo |
|---------|----------|
| `latest-report.json` | Billing Functional Certification completo |
| `summary.json` | Totais e cobertura |
| `stress-report.json` | Stress 100–5000 |
| `regression-report.json` | Por cenário |
| `golden-dataset-report.json` | Golden Dataset stats |

---

## Execução

```bash
cd packages/backend
npm run billing:cert-lab      # CLI completo + relatórios
npm test -- billingCertificationLab   # Regression suite (vitest)
```

---

## Testes

| Suite | Testes |
|-------|--------|
| Golden Dataset registry | 2 |
| Scenario Runner (48 cenários) | 48 |
| Regression Suite | 1 |
| Stress 100 | 1 |
| **Total** | **52** |

`npm run build` ✅

---

## Billing Functional Certification Report

O relatório único contém:

- Total de cenários, aprovados, reprovados
- Tempo médio e performance (stress)
- Cobertura: funcional, financeira, operacional, gateway, notificações, scheduler, worker, migration, projection, consistency, shadow, certification
- `recommendation`: `CERTIFIED` | `NOT_CERTIFIED`

---

## Compatibilidade

- Nenhuma alteração em produção
- Nenhuma escrita em banco
- Nenhuma invoice, gateway ou feature flag alterada
- Somente leitura/execução in-memory dos engines V2

---

## Critério de aprovação

Sprint de código concluída quando:

- [x] Todos os cenários obrigatórios passam (vitest)
- [x] Regression Suite 100%
- [x] Stress Suite (100 iterações em CI; 5000 no CLI)
- [x] Golden Dataset 100%
- [x] Build limpo

Esta sprint **não autoriza deploy**. Certifica tecnicamente que o motor está pronto para a **Sprint 2.4C — Billing Engine V2 Activation**.

---

## Conclusão

O Functional Certification Lab fecha o ciclo de homologação local: Golden Dataset permanente, regression suite automatizada e stress runner garantem que alterações futuras no Billing Engine V2 não reintroduzam regressões antes da ativação definitiva.
