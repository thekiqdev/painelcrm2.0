# BILLING ENGINE V2 — Sprint 3.0E — Production Pipeline Certification

**Data:** 2026-06-26  
**Modo:** AUDIT + CERTIFICATION — READ ONLY — Worker/Scheduler inalterados  
**Breaking changes:** Não  
**Database changes:** Não  
**Feature flags:** Nenhuma

---

## Resumo

Certificação operacional completa comparando o pipeline legado (`BillingRenewalEngine` → `executeCustomerRenewal`) com o novo pipeline (`BillingEngineV2` + `BillingPersistenceOrchestrator`). A sprint prova paridade nos efeitos operacionais antes de qualquer alteração no Worker (Sprint 3.1).

**Resultado:** `BillingProductionCertificationReport = APPROVED` (100% em todos os gates).

---

## Arquitetura comparada

| Legado (V1) | Novo (V2) |
|-------------|-----------|
| Worker (inalterado) | Worker (inalterado) |
| BillingRenewalEngine | BillingEngineV2 |
| executeCustomerRenewal | BillingPersistenceOrchestrator |
| Persist / Gateway / Notifications / Timeline / History / Advance | Idem |

---

## Novos módulos (`packages/backend/src/billingPipelineCertification/`)

| Módulo | Responsabilidade |
|--------|------------------|
| `types.ts` | `PipelineOperationalSnapshot`, `BillingProductionCertificationReport` |
| `pipelineCertificationLogger.ts` | Logs `[PIPELINE_CERTIFICATION]`, `[PIPELINE_COMPARE]`, `[PIPELINE_GATE]`, `[PIPELINE_RESULT]` |
| `pipelineSnapshotNormalizer.ts` | Normaliza capturas V1/V2 para snapshots comparáveis |
| `pipelineComparer.ts` | Comparação dimensão a dimensão + scoring |
| `pipelineCertificationScenarios.ts` | 17 cenários golden pareados |
| `billingProductionCertificationEngine.ts` | Engine de certificação + relatório final |
| `index.ts` | Exports |

**Versão:** `v2_pipeline_certification_sprint_3_0e`

---

## Dimensões certificadas

| Dimensão | Gate mínimo | Resultado |
|----------|-------------|-----------|
| CustomerInvoice | 100% | ✅ |
| CustomerInvoiceItems | 100% | ✅ |
| Gateway payload | 100% | ✅ |
| Notification queue | 100% | ✅ |
| Timeline | 100% | ✅ |
| Renewal History | 100% | ✅ |
| Subscription (advance) | 100% | ✅ |
| BillingRenewalResult | 100% | ✅ |
| Idempotência | 100% | ✅ |
| Rollback transacional | 100% | ✅ |

---

## Cenários (17)

`simple_renewal`, `monthly`, `annual`, `trial`, `discount`, `taxes`, `gateway_approved`, `gateway_refused`, `notification_failure`, `timeline_failure`, `history_failure`, `rollback`, `idempotency`, `concurrency`, `retry`, `subscription_advance`, `billing_result_parity`

---

## Contrato do relatório

```typescript
BillingProductionCertificationReport {
  overall_score: 100
  approved: true
  invoice_score: 100
  invoice_items_score: 100
  gateway_score: 100
  notification_score: 100
  timeline_score: 100
  history_score: 100
  subscription_score: 100
  billing_result_score: 100
  idempotency_score: 100
  rollback_score: 100
  blocking_issues: []
  warnings: []
  recommendation: 'APPROVED'
}
```

---

## Execução

```bash
# Testes (36 cenários)
npx vitest run src/billingPipelineCertification/billingPipelineCertification.test.ts

# CLI
npm run billing:pipeline-cert
```

---

## Explicitamente não alterado

- `BillingEngineV2`
- `BillingPersistenceOrchestrator`
- `BillingRenewalEngine`
- Worker / Scheduler
- Gateway
- Notification Engine

---

## Definition of Done

| Item | Status |
|------|--------|
| Pipeline operacional certificado | ✅ |
| Paridade V1 vs V2 comprovada | ✅ |
| Nenhuma divergência funcional nos gates | ✅ |
| Build limpo | ✅ |
| 36 testes aprovados (mín. 30) | ✅ |
| `ProductionCertificationReport = APPROVED` | ✅ |

---

## Próxima sprint

**3.1 — Worker Cutover** — alterar o Worker para consumir `BillingPersistenceOrchestrator`, com base na certificação APPROVED desta sprint.
