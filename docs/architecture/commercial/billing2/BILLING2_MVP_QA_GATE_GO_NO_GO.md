# Billing 2.0 — Gate QA MVP · Relatório Go / No-Go

| Campo | Valor |
|-------|-------|
| **Data/hora** | 2026-07-27 (~17:11–17:16 BRT) |
| **Ambiente** | Local = proxy de staging (`painelcrm_postgres` Docker + Asaas sandbox) |
| **Escopo** | MVP Sprints 0–8 (Super Admin Billing SaaS) |
| **Código alterado neste gate** | Nenhum (somente evidências + este relatório) |
| **Veredito** | **NO-GO** para ativação / go-live gradual |

## 1. Resumo executivo

O MVP Billing 2.0 está **implementado em código** e as automações destrutivas resolvem **OFF** por default (catálogo). Os testes **focados em Billing 2.0** passaram. Porém o gate de QA **não está verde** para declarar MVP aprovado / liberar ativação:

1. Migrations `298` / `299` **existem em disco** mas **não estão em** `migrationOrder.ts` → tabelas de Collection Policy / audit e seeds `billing2.*` **ausentes** no banco local.
2. Runtime loga `[billing_audit_events] tabela ausente — rode migration 298; evento descartado`.
3. Backend HTTP **não respondeu** em `localhost:3002` durante o gate → smoke de APIs/UI Super Admin **não executado**.
4. Itens de staging E2E (suspend/reativa, demo PRD §19) **não cobertos**.
5. Suites full (backend/frontend) têm falhas — maioria **fora** do Billing 2.0, mas impedem “todos os testes automatizados verdes”.

**Produção com flags OFF (defaults):** risco operacional baixo *se* o deploy não ativar flags e se migrations 298/299 forem corrigidas antes de qualquer feature Billing 2.0 depender de audit/policy DB.

---

## 2. Veredito por critério do gate

Fonte: `BILLING2_MVP_DECLARATION.md` + closeout S8.

| Critério | Resultado | Evidência |
|----------|-----------|-----------|
| Smoke L2 (getPayment / dry-run) | **PARCIAL PASS** | `03_l2_dry_flag_on.log` — Asaas sandbox OK; 0 divergências na amostra; apply OFF bloqueado |
| Dunning timeline (sem suspend) | **PARCIAL PASS** | `05_dunning_dry_flag_on.log` — dry-run `scanned=10`; emit OFF bloqueado em `04_*` |
| Suspend/reactivate E2E flags ON | **FAIL / NÃO EXECUTADO** | Não ligado `auto_suspend` / engine; backend API down |
| Regressão renovação legado flags OFF | **PASS (unitário)** | `billingService.saasRenewal` + `billingRenewalEngine` + collection policy OFF paths |
| Aprovação produto demo PRD §19 | **FAIL / NÃO EXECUTADO** | Fora do escopo técnico deste gate |
| Flags destrutivas OFF por default | **PASS** | `01_flag_snapshot_defaults.log` |
| Auditabilidade (billing_audit_events) | **FAIL** | Tabela ausente (`08_db_schema_gate.log`) |
| Seeds Super Admin `billing2.*` | **FAIL** | 0 rows namespace `billing2` |
| APIs Super Admin Billing 2.0 | **FAIL / NÃO EXECUTADO** | Health `localhost:3002` connection refused |

**Veredito agregado: NO-GO.**

---

## 3. Testes automatizados

### 3.1 Billing 2.0 focado (PASS)

```text
packages/backend — collectionPolicy + billing2 + L2
Test Files  7 passed
Tests       38 passed
```

Inclui: feature flags, MRR, webhook reprocess, L2 flag OFF / paid-remote dry-run, Collection Policy engine OFF / auto_suspend OFF.

Frontend:

```text
src/lib/billing2/collectionPolicyForm.test.ts
Test Files  1 passed · Tests 4 passed
```

### 3.2 Suite `tests/billing` (raiz) (PASS)

```text
Test Files  27 passed
Tests       739 passed
```

Evidência: execução registrada no histórico do gate (2026-07-27 17:12).

### 3.3 Backend full `packages/backend` vitest (FAIL)

```text
Test Files  5 failed | 184 passed (189)
Tests       34 failed | 1252 passed (1286)
```

Log: [`evidence/06_backend_vitest_full.log`](./evidence/06_backend_vitest_full.log)

Arquivos com falha (não Billing 2.0 S0–S8):

| Arquivo | Natureza |
|---------|----------|
| `workerCrmRenewalPipeline.test.ts` | UUID inválido `sub-1` / integração DB real |
| `billingMigrationReadiness/migrationReadiness.test.ts` | `mockReset` em mock inválido |
| `acquisition*.test.ts` | Acquisition (fora do MVP Billing 2.0) |
| `migrationGuard.test.ts` | Strict mode startup |

### 3.4 Frontend full vitest (FAIL)

```text
Test Files  19 failed | 97 passed (116)
Tests       93 failed | 2018 passed (2111)
```

Log: [`evidence/07_frontend_vitest_full.log`](./evidence/07_frontend_vitest_full.log)

Predominam falhas em `subscriptionFinancial*` / chat-core — **fora** do núcleo Billing 2.0 Super Admin. Billing2 form tests verdes.

---

## 4. Feature Flags — OFF vs ON

Ambiente: **sem rows `billing2.*` no DB** → resolução por **default catálogo** (e override `.env` quando setado no probe).

### 4.1 Snapshot defaults (OFF destrutivas)

Arquivo: [`evidence/01_flag_snapshot_defaults.log`](./evidence/01_flag_snapshot_defaults.log)

| Flag | enabled | from | Esperado MVP |
|------|---------|------|--------------|
| `collection_policy_engine_enabled` | false | default | OFF |
| `past_due_writer_enabled` | false | default | OFF |
| `dashboard_mrr_contracted` | false | default | OFF |
| `reconciliation_l2_enabled` | false | default | OFF |
| `dunning_enabled` | false | default | OFF |
| `auto_suspend` | false | default | OFF |
| `auto_cancel` | false | default | OFF |
| `reconciliation_auto` | true | default | ON (não destrutiva) |
| `collection_policy_db_read` | true | default | ON (sem efeito útil sem migration 298) |

### 4.2 Matriz operacional executada

| Cenário | Flag | Modo | Resultado | Log |
|---------|------|------|-----------|-----|
| L2 apply | `reconciliation_l2_enabled=false` | apply | `skipped: true`, `reason: flag_reconciliation_l2_enabled_off` | `02_l2_apply_flag_off.log` |
| L2 dry-run | `=true` (env) | dry-run | `skipped: false`, `divergences: 0`, `applied: 0`, getPayment sandbox OK | `03_l2_dry_flag_on.log` |
| Dunning apply | `dunning_enabled=false` | apply | `skipped: true`, `reason: flag_dunning_enabled_off` | `04_dunning_apply_flag_off.log` |
| Dunning dry-run | `=true` (env) | dry-run | `scanned: 10`, `overdue_events: 10`, sem emit real | `05_dunning_dry_flag_on.log` |
| L2 job npm | defaults | dry-run | `flag_on: false`, scanned via dry-run path; L1 auto também rodou | console gate 17:12 |

**Suspend/cancel:** não exercitados com flags ON (propositadamente — destrutivo; e engine/policy DB indisponíveis).

---

## 5. Schema / migrations (blocker)

[`evidence/08_db_schema_gate.log`](./evidence/08_db_schema_gate.log)

| Objeto | Estado |
|--------|--------|
| `billing_collection_policies` | **ausente** (`to_regclass` null) |
| `billing_audit_events` | **ausente** |
| `platform_feature_flags` namespace `billing2` | **0 rows** |
| `schema_migrations` 298/299 | **não registradas** |

Causa raiz observada: arquivos

- `database/init/298_billing2_collection_policy_and_audit.sql`
- `database/init/299_billing2_platform_feature_flags.sql`

existem, mas **`MIGRATION_ORDER` termina em `297_…` + `create-admin-user.sql`** — migrate não aplica 298/299.

Impacto: UI Cobrança Automática / audit export / seeds de flags Super Admin **não têm backing completo** neste ambiente.

Dados de amostra úteis (local):

- Open `tenant_billing` com `gateway_reference_id`: **11**
- Vencidas (`due_date < hoje`, status aberto): **19**

---

## 6. APIs / UI Super Admin

| Check | Resultado |
|-------|-----------|
| `GET http://localhost:3002/health` | **FAIL** — connection refused |
| `GET /api/superadmin/billing/feature-flags` | **FAIL** — backend down |
| Hub Financeiro / Ops L2 UI | **NÃO EXECUTADO** |

`start.bat` reportou aviso de backend não respondendo a tempo; janela Backend não estava saudável no momento do gate.

---

## 7. Riscos e rollback

| Risco | Severidade | Mitigação atual |
|-------|------------|-----------------|
| Ativar L2/dunning/engine sem 298 | Alta | Manter flags OFF; corrigir migration order antes |
| Audit descartado silenciosamente | Alta (compliance) | Migration 298 obrigatória |
| Seeds billing2 ausentes → só defaults/env | Média | Migration 299 + UI flags |
| Suite full vermelha (ruído não-B2) | Média | Isolar CI Billing 2.0; triagem CRM/chat |
| Apply L2 em massa | Alta | dry-run default; flag OFF |

Rollback operacional (quando flags existirem no DB): desligar `billing2.reconciliation_l2_enabled`, `dunning_enabled`, `collection_policy_engine_enabled`, `auto_suspend`, `auto_cancel`.

---

## 8. Condições para reverter NO-GO → GO

Checklist mínimo (ordem sugerida):

1. [ ] Incluir `298` e `299` em `migrationOrder.ts` e aplicar migrate (sem mudar defaults destrutivos).
2. [ ] Confirmar tabelas `billing_collection_policies`, `billing_audit_events` + 16 keys `billing2.*`.
3. [ ] Subir backend saudável; smoke:
   - `GET /api/superadmin/billing/feature-flags`
   - `GET …/collection-policy`
   - `GET …/audit-events`
   - `GET …/reconciliation-l2/divergences`
   - `POST …/reconciliation-l2/run` dry_run
   - `POST …/dunning/run` dry_run
4. [ ] Staging: 1 divergência real Asaas paid / local pending → L2 apply com flag ON → paid local + audit.
5. [ ] Staging: dunning dry-run timeline; **depois** (opcional) suspend E2E só com `auto_suspend` + engine ON em tenant canário.
6. [ ] Regressão manual: renovação SaaS com **todas** flags destrutivas OFF.
7. [ ] Demo produto PRD §19 + aprovação explícita.
8. [ ] (Desejável) CI job só Billing 2.0 verde; falhas CRM/chat fora do gate MVP.

Até lá: **não ativar** flags Billing 2.0 em produção.

---

## 9. Inventário de evidências

Pasta: `docs/architecture/commercial/billing2/evidence/`

| Arquivo | Conteúdo |
|---------|----------|
| `01_flag_snapshot_defaults.log` | Snapshot flags (defaults) |
| `02_l2_apply_flag_off.log` | L2 apply skipped |
| `03_l2_dry_flag_on.log` | L2 dry-run + getPayment sandbox |
| `04_dunning_apply_flag_off.log` | Dunning apply skipped |
| `05_dunning_dry_flag_on.log` | Dunning dry-run contagem |
| `06_backend_vitest_full.log` | Suite backend completa |
| `07_frontend_vitest_full.log` | Suite frontend completa |
| `08_db_schema_gate.log` | Ausência 298/299 / billing2 seeds |

---

## 10. Assinaturas

| Papel | Status |
|-------|--------|
| QA técnico (este relatório) | **NO-GO** — 2026-07-27 |
| Product Owner | _pendente_ |
| Eng. responsável migrations | _pendente (298/299)_ |

---

## Referências

- [`BILLING2_MVP_DECLARATION.md`](./BILLING2_MVP_DECLARATION.md)
- [`BILLING2_SPRINT8_CLOSEOUT.md`](./BILLING2_SPRINT8_CLOSEOUT.md)
- [`BILLING2_PR_QA_CHECKLIST.md`](./BILLING2_PR_QA_CHECKLIST.md)
- [`IMPLEMENTATION_PLAN_BILLING_2.md`](../IMPLEMENTATION_PLAN_BILLING_2.md) — Sprint 8 gate
