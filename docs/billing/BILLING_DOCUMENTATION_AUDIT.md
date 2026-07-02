# Billing Engine 3.0 — Documentation Audit

**Data:** 2026-06-26

---

## Classificação

### Documentação operacional (Billing Engine 3.0) ✅

| Arquivo | Conteúdo |
|---------|----------|
| `ARCHITECTURE_V3.md` | Arquitetura GA atual |
| `LEGACY_REMOVAL_REPORT.md` | Sprint 3.2 remoção |
| `BREAKING_CHANGES.md` | Mudanças 3.0 |
| `DEPENDENCY_GRAPH.md` | Grafo pós-consolidação |
| `BILLING_V2_SPRINT_3_1_WORKER_CUTOVER_REPORT.md` | Cutover worker (ainda válido operacionalmente) |
| `BILLING_V2_SPRINT_3_1A_OBSERVABILITY_REPORT.md` | Observability (tags V2 desatualizadas no código) |

### Documentação histórica (migração / V1 / V2) 📁

33 arquivos em `docs/billing/` com prefixos:

- `BILLING_V2_SPRINT_*` (22 relatórios de sprint)
- `AUDIT_*` pré-3.2 (8 auditorias)
- `B0_*` foundation B0.x (5 documentos)
- `BILLING_ENGINE_ARCHITECTURE_REVIEW_V1.md`

Estes descrevem `executeCustomerRenewal`, cutover, dual execution — **não refletem produção atual**.

**Recomendação:** mover para `docs/billing/archive/` ou adicionar banner `HISTORICAL — pre-3.0`.

### Documentação obsoleta (conteúdo factualmente incorreto pós-3.2) ⚠️

| Arquivo | Problema |
|---------|----------|
| `AUDIT_LEGACY_DEPENDENCIES.md` | Afirma módulos que foram removidos como ativos |
| `AUDIT_PRODUCTION_READINESS.md` | Estado pré-Worker cutover |
| `AUDIT_BILLING_ENGINE_V2_INDEPENDENCE.md` | Referencia `billingEngineV2/` |
| `BILLING_V2_SPRINT_3_0E_*` | Compara V1 vs V2 (concluída) |
| `BILLING_V2_SPRINT_3_0_PRODUCTION_ENGINE_REPORT.md` | Motor "V2" naming |

---

## Termos auditados em `docs/billing/`

| Termo | Arquivos (aprox.) | Operacional | Histórico |
|-------|-------------------|-------------|-----------|
| `V2` | 35+ | 2 | 33+ |
| `Migration` | 12 | 0 | 12 |
| `Cutover` | 8 | 0 | 8 |
| `Dual Execution` | 3 | 0 | 3 |
| `Legacy` | 15 | 2 | 13 |
| `Invoice Copy` | 10 | 0 | 10 |

---

## Comentários em código

| Padrão | Exemplos | Ação sugerida |
|--------|----------|---------------|
| `Billing Engine V2` em headers | `billingPlanRepository.ts`, vários | Renomear comentário → 3.0 |
| `Sprint 3.0` | engineLogger, orchestrator | OK histórico |
| `Persistence Orchestrator` | orchestratorLogger | Renomear → Execution |

---

## Conclusão

Documentação **operacional mínima existe e está correta** (4 docs 3.0 + este audit). O volume histórico V2 é alto e pode confundir onboarding — não bloqueia operação, mas bloqueia critério estrito "documentação operacional reflete apenas 3.0".
