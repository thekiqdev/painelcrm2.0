# Billing 2.0 — Sprint 2 Closeout

| Campo | Valor |
|-------|-------|
| **Sprint** | 2 — Persistência |
| **Data** | 2026-07-27 |
| **Status** | Implementada — aguardando aprovação |

## Entregáveis

| Item | Status |
|------|--------|
| Migration `298` + supabase espelho | ✅ |
| Tabela `billing_collection_policy` + seed defaults S1 | ✅ |
| Tabela `billing_audit_events` append-only | ✅ |
| Repository + ensure seed | ✅ |
| Reader DB com fallback memória | ✅ |
| Flag `collection_policy_db_read` (default ON; OFF = rollback) | ✅ |
| Audit writer fail-open + sanitize | ✅ |
| API GET/PUT `/api/superadmin/billing/collection-policy` | ✅ |
| Colunas token/pix em subscriptions | ❌ fora (S9/S10) |
| Engine / UI Cobrança Automática | ❌ fora (S3/S4) |

## Ajuste pós-S2 — Resolução de Feature Flags (pré-S3)

**Não altera PRD nem escopo funcional.** Apenas prioridade de leitura para rollout/operação.

Ordem oficial:

1. **Super Admin** — `platform_feature_flags` (`billing2.<key>`, `default_enabled`)
2. **`.env`** — `BILLING2_FLAG_<KEY>` (só se a flag **não** existir no DB, ou se a leitura do DB falhar — bootstrap/contingência)
3. **Default** — catálogo `BILLING2_FLAG_CATALOG` (PRD §18 / plano)

| Item | Status |
|------|--------|
| Migration `299` seed namespace `billing2` (mesmos defaults; sem ativar engine) | ✅ |
| Facade `billingFeatureFlags` async: DB → env → default | ✅ |
| UI inventário + Avançado (namespace `billing2`) | ✅ |
| Docs Implementation Plan + este closeout | ✅ |

Comportamento de produção com seeds default: **inalterado** (engine OFF; destrutivas OFF; `collection_policy_db_read` ON).

## Critérios de aceite

- [x] Migration aditiva / seed idempotente
- [x] Seed = defaults (comportamento cobrança inalterado; engine OFF)
- [x] Audit fail-open
- [x] Resolução FF: DB → env → default (sem ligar flags novas)
- [ ] Aplicar migrations `298`/`299` em staging + smoke GET/PUT (operador)

## Rollback

1. Super Admin → Avançado → Feature Flags → `billing2.collection_policy_db_read` = OFF → reader usa memory_default  
2. Contingência: se a row não existir no DB (ou DB indisponível), `BILLING2_FLAG_COLLECTION_POLICY_DB_READ=false`  
3. Tabelas podem permanecer (aditivas)  
4. Revert código API/reader se necessário  

## APIs

- `GET /api/superadmin/billing/collection-policy`
- `PUT /api/superadmin/billing/collection-policy` (body = campos da policy; grava audit)
- `GET /api/superadmin/billing/feature-flags` (snapshot com `resolution_order: db → env → default`)
