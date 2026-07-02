# Billing Auditor Certification — Sprint 4.2A

## Escopo

Certificação do **próprio auditor** — prova que encontra inconsistências propositais e mapeia reparos corretos.

## Implementação

| Componente | Caminho |
|------------|---------|
| Catálogo de cenários | `audit/validation/auditorScenarioCatalog.ts` |
| Validador sintético | `audit/validation/auditorScenarioValidator.ts` |
| Artefato | `auditor-certification.json` |

## Cenários (9)

Cada cenário define:

- `inject` — descrição da falha injetada
- `detection_codes` — códigos emitidos pelos módulos 4.2
- `repair_actions` — strings de reparo do `validateBillingRuntime`
- `audit_modules` — módulos responsáveis

## Validação

1. **Estado simulado** — injeção proposital em memória
2. **Detecção** — `detectIssuesFromSimulatedState()` espelha códigos reais
3. **Reparo** — `repairActionsForSimulatedState()` espelha ações do runtime
4. **Estado limpo** — verificação de falso positivo

## Métricas do relatório

```json
{
  "auditor_certified": true,
  "scenarios_total": 9,
  "scenarios_passed": 9,
  "detection_rate_pct": 100,
  "repair_rate_pct": 100,
  "false_positives": 0,
  "false_negatives": 0
}
```

## Certificado

Quando `auditor_certified: true`, o certificado oficial **AUDITOR CERTIFIED** é emitido em `deployment-certification.json`.

## Correção aplicada (causa raiz)

`migrationCertification.ts` — recontagem pós-reparo de billing plans/items (antes subtraía reparos sem re-query).
