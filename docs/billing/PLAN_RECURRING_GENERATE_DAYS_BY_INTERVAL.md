# Plano — Antecipação de geração por periodicidade (semanal vs demais)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-01 |
| **Tipo** | Plano de implementação (sprints sequenciais) |
| **Escopo** | Preferências de tenant em `/settings/billing` + resolução SSOT de `days_before` por `billing_interval` |
| **Fora de escopo** | Pipeline de criação de fatura (`createCustomerInvoice`, itens, gateway, WhatsApp); alteração de `cycle_key` / `due_date`; auto-recreate UazAPI |
| **Pré-requisito** | Investigação 2026-08-01 — campo único + cap por intervalo; produto quer semanal ≠ mensal (ex.: 2 vs 7) |
| **Docs relacionados** | [`GERACAO_ANTECIPADA_FATURAS_RECORRENTES.md`](../GERACAO_ANTECIPADA_FATURAS_RECORRENTES.md) · [`AUDIT_RENEWAL_ENGINE.md`](./archive/AUDIT_RENEWAL_ENGINE.md) §4 · [`FASE_2_MOTOR_JANELA_RECORRENCIA_POR_TENANT.md`](../FASE_2_MOTOR_JANELA_RECORRENCIA_POR_TENANT.md) |
| **Status** | **Onda concluída (5.1–5.3 ✅)** |

---

## 1. Resumo executivo

| # | Situação hoje | Destino |
|---|---------------|---------|
| **A** | Um único `tenants.recurring_invoice_generate_days_before_due` para todas as assinaturas | Valor **geral** (mensal / trimestral / …) + valor **semanal** configurável |
| **B** | Cap `min(tenant, ciclo−1)` evita semanal com 7 sobrepor ciclo, mas força semanal≈6 se tenant=7 | Semanal pode ser **2** e mensal **7** no mesmo tenant |
| **C** | BE de geração usa `effectiveRecurringGenerateDaysBeforeDue`; FE de preview muitas vezes só `clamp` sem intervalo | **Uma** função SSOT para tenant→dias por intervalo; FE e BE alinhados |

**Não negociável:** não alterar o motor de **emissão** da fatura — só a resolução de **quando** o ciclo fica elegível (`generation_date`).

---

## 2. Decisões de produto / técnica (fechadas neste plano)

| ID | Decisão |
|----|---------|
| **D1** | UI na sessão **“Geração de faturas recorrentes”**: campo antecipação **geral** + campo antecipação **semanal**. |
| **D2** | Campo atual `recurring_invoice_generate_days_before_due` = antecipação **padrão / não-semanal** (mensal, quarterly, semi_annual, yearly, e fallback). |
| **D3** | Novo campo dedicado semanal (migration): `recurring_invoice_generate_days_before_due_weekly` `INTEGER NULL`. `NULL` = herda o valor geral (compatível com tenants existentes). |
| **D4** | Cap por intervalo **permanece** (`weekly` máx. 6, etc.) — o valor configurado nunca ultrapassa `ciclo_dias − 1`. |
| **D5** | SSOT: um resolver TypeScript + espelho SQL no scheduler; nenhum consumidor inventa a fórmula. |
| **D6** | JSONB `by_interval` **adiado** — produto pediu só semanal vs demais; coluna dedicada é mais simples para SQL/`LEAST` e UI. Evolução futura pode migrar para JSONB sem mudar a API do resolver. |
| **D7** | Execução **uma sprint por vez** (`ok sprint 5.1` → gate → `ok sprint 5.2` → …). |

---

## 3. Modelo de dados

### 3.1 Migration (Sprint 5.1)

Arquivo sugerido: `database/init/NNN_tenants_recurring_generate_days_before_weekly.sql`

```sql
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS recurring_invoice_generate_days_before_due_weekly INTEGER NULL;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_recurring_invoice_generate_days_before_due_weekly_chk;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_recurring_invoice_generate_days_before_due_weekly_chk
  CHECK (
    recurring_invoice_generate_days_before_due_weekly IS NULL
    OR (
      recurring_invoice_generate_days_before_due_weekly >= 0
      AND recurring_invoice_generate_days_before_due_weekly <= 60
    )
  );

COMMENT ON COLUMN public.tenants.recurring_invoice_generate_days_before_due_weekly IS
  'Dias antes do vencimento para enfileirar renovação de assinaturas weekly. NULL = herda recurring_invoice_generate_days_before_due. Efetivo ainda limitado pelo cap do intervalo (máx. 6).';
```

**Sem backfill obrigatório:** `NULL` preserva comportamento atual (semanal usa o geral + cap).

### 3.2 Fórmula SSOT

```text
tenant_raw(interval) =
  if interval == 'weekly' AND weekly_col IS NOT NULL
    then weekly_col
    else recurring_invoice_generate_days_before_due   -- geral (0–60)

dias_efetivos(interval) =
  min( clamp(tenant_raw, 0..60), maxRecurringGenerateDaysBeforeForInterval(interval) )
```

`generation_date = cycle_due − dias_efetivos` (inalterado).

---

## 4. Mapa de consumidores (devem usar SSOT)

| Consumidor | Hoje | Sprint |
|------------|------|--------|
| `BILLING_EFFECTIVE_GENERATE_DAYS_BEFORE_SQL` | `LEAST(tenant_geral, CASE interval)` | 5.1 — incluir `COALESCE(weekly, geral)` para `weekly` |
| `buildBillingWindowDiagnostic` / `effectiveRecurringGenerateDaysBeforeDue` | recebe `tenantDays` já escolhido? hoje só geral | 5.1 — resolver antes de chamar |
| `recurringBillingJobService` meta / enqueue | geral + cap | 5.1 |
| `customerInvoiceRecurrenceInsightService` | geral + cap por `sub.billing_interval` | 5.1 |
| `subscriptionTimelineUx` | geral + cap | 5.1 |
| Preferences API GET/PUT | só campo geral | 5.1 (API) + 5.2 (payload UI) |
| `BillingSection.tsx` | 1 input | 5.2 |
| FE preview (`clampRecurringGenerateDaysBeforeDue` sem interval) | drift | 5.3 |

**Fora:** `createCustomerInvoice`, advance subscription, gateway — não leem este N diretamente para montar a fatura.

---

## 5. Sprints

### Sprint 5.1 — Migration + SSOT backend

| Campo | Valor |
|-------|-------|
| **Status** | ✅ Concluída (2026-08-01) |
| **Esforço** | 1–1,5 dia |
| **Objetivo** | Semanal e demais usam N corretos no scheduler/worker/insight **sem** mudar emissão de fatura |

**Entregas**

- [x] Migration §3.1 (`database/init/307_tenants_recurring_generate_days_before_weekly.sql`).
- [x] Extender `tenantBillingPreferencesService` / tipos: ler/gravar `…_weekly`; resolved com `weekly` / `source`.
- [x] SSOT: `resolveTenantGenerateDaysBeforeDueRaw` + overload de `effectiveRecurringGenerateDaysBeforeDue` em `billingIntervalGenerationCap.ts` + testes.
- [x] Atualizar `effectiveRecurringGenerateDaysBeforeDue` para receber o par general/weekly.
- [x] Atualizar `BILLING_EFFECTIVE_GENERATE_DAYS_BEFORE_SQL` para:
  - `weekly` → `LEAST(COALESCE(t.…_weekly, t.…_geral), 6)`
  - demais → `LEAST(t.…_geral, cap)`
- [x] Ligar enqueue, janela, insight, timeline BE ao resolver.
- [x] API `GET`/`PUT` `/api/me/tenant/billing-preferences`: aceitar e devolver `recurring_invoice_generate_days_before_due_weekly` (nullable; omisso no PUT = não altera).
- [x] **Não** alterar UI nesta sprint (API pronta; UI na 5.2).

**Testes obrigatórios**

- [x] `weekly` + weekly=2 + geral=7 → efetivo **2**.
- [x] `weekly` + weekly=`NULL` + geral=7 → efetivo **6** (cap), igual hoje.
- [x] `monthly` + weekly=2 + geral=7 → efetivo **7** (ignora weekly).
- [x] `weekly` + weekly=10 → efetivo **6** (cap).
- [x] Preferências resolve (weekly null / set / 0) + mocks de consumers; UI round-trip na 5.2.

**Gate**

- [x] Migration aplica limpa (IF NOT EXISTS + CHECK 0–60).
- [x] Testes unitários verdes (`billingIntervalGenerationCap`, preferences resolve, consumers).
- Staging: 1 assinatura weekly e 1 monthly — `generation_date` / logs coerentes; fatura criada continua com `due_date` = ciclo (ops pós-deploy).

---

### Sprint 5.2 — UI `/settings/billing`

| Campo | Valor |
|-------|-------|
| **Status** | ✅ Concluída (2026-08-01) |
| **Esforço** | 0,5–1 dia |
| **Objetivo** | Sessão “Geração de faturas recorrentes” com dois controles claros |

**Entregas**

- [x] Reorganizar copy da secção: título **Geração de faturas recorrentes** (timezone / horário H / antecipação).
- [x] Input **Antecipação (mensal e demais periodicidades)** → campo geral existente.
- [x] Input **Antecipação (assinaturas semanais)** → `…_weekly` (vazio = herda geral → `NULL`).
- [x] Help text: vencimento não muda; cap semanal máx. 6; exemplo “semanal 2 dias / mensal 7 dias”.
- [x] Validação 0–60; `NULL` quando input vazio (“usar geral”).
- [x] `tenantBillingPreferences` FE types + load/save.

**Gate**

- [x] Payload envia `weekly` number ou `null`; reload preenche / limpa o input.
- [x] Vazio → `NULL` → herda geral (API 5.1).
- [x] Horário H / notify inalterados na secção.

---

### Sprint 5.3 — Alinhar frontend de preview (SSOT visual)

| Campo | Valor |
|-------|-------|
| **Status** | ✅ Concluída (2026-08-01) |
| **Esforço** | 0,5–1 dia |
| **Objetivo** | Datas “geração prevista” na assinatura/fatura = mesmo N do worker |

**Entregas**

- [x] Helper FE SSOT em `recurringGenerationPreview.ts` (espelho do BE) + `effectiveDaysBeforeFromTenantBilling`.
- [x] Trocar usos de `clampRecurringGenerateDaysBeforeDue(tenant_geral)` sem intervalo em:
  - `billingSubscriptionExperience.resolveGenerationYmd` (+ calendário / cards / futuros)
  - `SubscriptionDetail` / `subscriptionRecurringDisplay` / health card / timeline
  - `CustomerInvoiceNew` já usa `tenant_recurring_generation.days_before_due` efetivo da API insight
- [x] Preferir sempre `billing_interval` da assinatura + par general/weekly do tenant.

**Gate**

- [x] Assinatura weekly com weekly=2 → geração = due−2 (testes).
- [x] Assinatura monthly com geral=7 → due−7 (testes).
- [x] Mesma fórmula do insight/worker (cap + herança weekly).

---

## 6. O que explicitamente NÃO muda

- `createCustomerInvoice` / draft / itens / gateway.
- `cycle_key`, `due_date`, `period_start` (= vencimento do ciclo).
- Janela horária H (já Sprint 1 da outra onda).
- Cap matemático por intervalo (só a **fonte** do N do tenant muda).
- Notificações WhatsApp (herdam `generation_date` automaticamente).

---

## 7. Critérios de sucesso

- [x] Mesmo tenant: semanal gera com N_weekly; mensal com N_geral.
- [x] Tenant sem `…_weekly` setado: comportamento idêntico ao pré-migration (herda geral + cap).
- [x] Nenhuma fatura duplicada / `due_date` errado por esta mudança (só resolução de N / preview).
- [x] UI settings explica os dois campos.
- [x] Preview FE (pós-5.3) = worker.

---

## 8. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| SQL e TS divergem | Uma constante/documentação da fórmula; testes que fixam weekly/monthly; review do `BILLING_EFFECTIVE_GENERATE_DAYS_BEFORE_SQL` no mesmo PR da 5.1 |
| UI grava 0 pensando “usar geral” | Distinguir `NULL` (herdar) vs `0` (gerar no dia do vencimento) — copy + empty input → NULL |
| FE continua a mostrar N geral em weekly | Sprint 5.3 obrigatória antes de declarar “feito” para ops de suporte |
| Expandir depois a quarterly etc. | Resolver já aceita `billingInterval`; UI só expõe weekly; JSONB pode vir depois |

---

## 9. Ordem de execução

```text
ok sprint 5.1  → migration + SSOT BE + API
    → gate
ok sprint 5.2  → UI settings
    → gate
ok sprint 5.3  → FE preview alinhado
    → fechar onda
```

---

## 10. Histórico de execução

| Data | Sprint | Resultado |
|------|--------|-----------|
| 2026-08-01 | — | Plano documentado |
| 2026-08-01 | 5.1 | ✅ Migration `307_…_weekly`; SSOT TS+SQL; preferences API; wiring scheduler/janela/insight/timeline; testes verdes |
| 2026-08-01 | 5.2 | ✅ UI settings: título + antecipação geral/semanal (vazio→NULL); FE types load/save |
| 2026-08-01 | 5.3 | ✅ FE SSOT preview (`effectiveDaysBeforeFromTenantBilling`); Detail/calendário/timeline/health alinhados ao worker |

---

*Documento vivo: atualizar Status e §10 ao concluir cada sprint.*
