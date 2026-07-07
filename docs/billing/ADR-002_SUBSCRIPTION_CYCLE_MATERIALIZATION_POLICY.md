# ADR-002 — Subscription Cycle Materialization Policy

**Sprint:** 5.0-23  
**Status:** ACCEPTED  
**Modo:** ARCHITECTURE DECISION RECORD  
**Data:** 2026-07-06  
**Relacionado:** [ADR-001 — Billing Domain Invariants](./ADR-001_BILLING_DOMAIN_INVARIANTS.md)

---

## Contexto

**ADR-001** definiu **o que** é competência financeira:

```
subscription_cycle.cycle_date  =  competência persistida (SSOT)
```

**ADR-002** define **quem** pode **criar** (materializar) essa competência no banco.

### Problema documentado (evidência 22D–22F)

Hoje apenas alguns fluxos materializam `subscription_cycles`; o restante **consome** `cycles_raw`. Isso produz estados divergentes entre camadas com a **mesma origem** — ausência de row persistida:

| Sintoma | Camada que vê | Camada que não vê | Evidência |
|---------|---------------|-------------------|-----------|
| Pós-Generate sem botão Gerar | Calendário (projeção) | NextInvoice real | 22F, `projection-only` golden |
| Calendar vs History | Calendar projected | History vazio | `projection-only.json` |
| Invoice apagada | Cycle com `invoice_id=NULL` | Gerar se status não reparado | `customerInvoiceAdminService.ts` L441–446 |
| PATCH avançou data | `next_billing_date` | Sem row até scheduler | 22D, `BILLING_CYCLE_GAP_ANALYSIS.md` |

**Conclusão das auditorias 22B–22F:** Aggregate, UI e refresh estão corretos; a divergência nasce na **política de materialização**, não na leitura.

---

## Decisão arquitetural

Instituir **um único serviço de domínio** responsável por garantir a existência de uma competência persistida:

```
SubscriptionCycleMaterializer
    └── ensureSubscriptionCycle(subscriptionId, dueDate, context?)
```

**Nenhum outro módulo** poderá executar `INSERT` / `UPSERT` inicial em `subscription_cycles` fora deste serviço (Sprint 5.0-23 Legacy Removal).

### Separação de responsabilidades (inviolável)

| Responsabilidade | Dono |
|------------------|------|
| **Garantir row de competência** | `SubscriptionCycleMaterializer` |
| **Transição de status** (processing → invoiced, cancelled, skipped) | Dual-write worker (`subscriptionCyclesOnJobCompleted`, etc.) — **UPDATE** em row existente |
| **Enfileirar job** | `recurringBillingJobService` (`insertOrReactivateRenewalJob`) |
| **Gerar invoice** | Worker / Manual pipeline |
| **Projeção UX** | Aggregate `projectionSnapshot` — **nunca** INSERT |
| **Leitura** | `getCrmSubscriptionDetail` → `cycles_raw` → Aggregate |

O Materializer **não** substitui o dual-write de **ciclo de vida** do worker; substitui a **política de nascimento** da competência.

---

## Estado atual vs alvo

### Hoje (pré-5.0-23) — criação dispersa

| Caminho | Função atual | INSERT cycle? |
|---------|--------------|---------------|
| Scheduler / tryEnqueue | `insertOrReactivateRenewalJob` → `subscriptionCyclesUpsertAfterScheduler` | **SIM** |
| Manual ensure job (ciclo C) | idem | **SIM** |
| Manual pós-sucesso (22E) | `tryEnqueueRenewalJobForSubscriptionId` → idem | **SIM** (condicional janela) |
| Worker pickup/complete | `upsertCycleRow` em `subscriptionCyclesDualWriteService.ts` | **SIM** (UPSERT defensivo) |
| Runtime validator | `repairRecoverableSubscriptionCycles` | **NÃO** (UPDATE failed→pending) |
| Migration 141 | SQL backfill | **SIM** (one-time) |
| Aggregate / UI | — | **NÃO** |

**Observação:** `subscriptionCyclesDualWriteService.ts` concentra o SQL, mas **não** há política única de *quando* materializar — cada caller decide (scheduler, job enqueue, worker).

### Alvo (pós-ADR-002)

```
Scheduler ──────┐
Manual Generate ┼──► ensureSubscriptionCycle() ──► subscription_cycles
PATCH / Resume ─┤         (única porta INSERT inicial)
Runtime repair ─┘

insertOrReactivateRenewalJob ──► job apenas (+ chama ensure antes)
Worker lifecycle ──► UPDATE status (row já existe)
```

---

## Contrato oficial

```typescript
/**
 * Garante que existe exatamente uma row em subscription_cycles
 * para (subscriptionId, dueDate). Idempotente.
 */
ensureSubscriptionCycle(
  subscriptionId: string,
  dueDate: string,          // YYYY-MM-DD — cycle_date canônico
  context?: {
    tenantId?: string;
    source: 'scheduler' | 'manual_generate' | 'patch_next_billing' | 'resume' | 'runtime_repair' | 'calendar_ensure';
    jobId?: string | null;  // opcional — associa job sem criar job
    reactivatePolicy?: 'failed_to_pending' | 'cancelled_to_pending' | 'none';
  }
): Promise<{
  cycleId: string;
  cycleDate: string;
  status: string;
  created: boolean;         // true se INSERT; false se row já existia
  reactivated: boolean;
}>
```

### Responsabilidades (✔)

| ✔ | Detalhe |
|---|---------|
| Localizar cycle existente | `SELECT` por `(subscription_id, cycle_date)` |
| Validar status | Respeitar `invoiced` imutável (ON CONFLICT rules atuais) |
| Reativar quando permitido | `failed`/`cancelled` → `pending` conforme política centralizada |
| Criar quando inexistente | `INSERT` com `status=pending`, bounds via `loadPeriodBounds` |
| Unicidade | `ON CONFLICT (subscription_id, cycle_date)` — já existe no DB |
| Nunca duplicar | Idempotência obrigatória |

### Proibido no Materializer (✘)

| ✘ | Motivo |
|---|--------|
| Gerar `customer_invoice` | Domínio de billing engine |
| Cobrar gateway | Domínio de gateway |
| Registrar pagamento | Domínio financeiro |
| Avançar `subscriptions.next_billing_date` | Domínio subscription lifecycle |
| Alterar `timeline` | Apresentação derivada |
| Disparar notificações | Side-effect engine |
| **Criar `billing_recurring_jobs` automaticamente** | Dono: `insertOrReactivateRenewalJob` (scheduler chama **depois** do ensure) |

---

## Fluxos oficiais (antes → depois)

### Generate Manual

**Antes (22E):**

```
POST manual-renew (cycle_id)
  → resolve cycle em DB
  → se ausente: cycle_required / erro
  → pipeline → invoice
  → tryEnqueue C+1 (condicional)
```

**Depois:**

```
POST manual-renew (cycle_id | dueDate implícito)
  → ensureSubscriptionCycle(subscriptionId, dueDate, { source: 'manual_generate' })
  → generateInvoiceForCycle(cycleId)
  → advance subscription
  → ensureSubscriptionCycle(subscriptionId, nextDueDate)   // C+1 — sem depender só de janela
  → insertOrReactivateRenewalJob (opcional, job only)
```

**Nota produto:** `ensure` em C+1 **elimina** a tensão 22F (janela `generation_date`) para materialização de competência; a janela pode continuar regendo **execução automática do worker**, não existência da row.

---

### Scheduler

**Antes:**

```
enqueueRenewalJobs()
  → insertOrReactivateRenewalJob()  // job + cycle acoplados
```

**Depois:**

```
enqueueRenewalJobs()
  → ensureSubscriptionCycle(subscriptionId, next_billing_date, { source: 'scheduler' })
  → insertOrReactivateRenewalJob()  // apenas job; cycle já existe
```

---

### PATCH `next_billing_date`

**Antes:** `tryEnqueueRenewalJobForSubscriptionId` (cycle só se janela OK).

**Depois:**

```
PATCH next_billing_date
  → cancel pending jobs (existente)
  → ensureSubscriptionCycle(subscriptionId, newDueDate, { source: 'patch_next_billing' })
  → tryEnqueue / insertOrReactivateRenewalJob
```

---

### Resume / Reactivate subscription

**Antes:** `tryEnqueueRenewalJobForSubscriptionId` best-effort.

**Depois:**

```
resume()
  → ensureSubscriptionCycle(subscriptionId, next_billing_date, { source: 'resume' })
  → tryEnqueue
```

---

### Runtime Validator

**Antes:** `repairRecoverableSubscriptionCycles` — UPDATE failed→pending; **sem** INSERT de gaps.

**Depois:**

```
validateBillingRuntime()
  → auditCycleConsistency() detecta gap operacional
  → ensureSubscriptionCycle() para competências elegíveis faltantes
  → repair failed→pending (mantém)
```

**Mudança de comportamento:** validator passa a **materializar** gaps detectados, não apenas reparar status — alinhado a INV-11.

---

### Calendar (opcional — decisão produto)

**Antes:** click em projected → `ProjectedCompetenceNotice` — sem ações.

**Depois (se produto aprovar):**

```
click projected dueDate
  → API POST ensure-cycle (dueDate)
  → GET refresh
  → popover com cycleId real → Gerar habilitado
```

Requer **novo endpoint** ou extensão de GET com side-effect (não recomendado). UI continua render-only; **backend** materializa sob demanda.

---

### Excluir invoice

**Antes (já parcialmente correto):**

```
deleteCustomerInvoice
  → detachSubscriptionCyclesInvoiceRef (invoice_id = NULL)
  → cycle permanece
```

**Depois:**

```
deleteCustomerInvoice
  → detach (mantém)
  → ensureSubscriptionCycle (reativar failed/cancelled se necessário)
  → Generate reutiliza cycle existente
```

Nenhuma migration; reforço de política de reativação centralizada no Materializer.

---

## Algoritmo oficial

```
ensureSubscriptionCycle(subscriptionId, dueDate, context):

  1. Normalizar dueDate → cycle_date canônico (billingCycleKey)

  2. SELECT cycle WHERE subscription_id AND cycle_date
     IF encontrado:
       IF status = 'invoiced' AND invoice_id IS NOT NULL:
         RETURN { existing, created: false }   // imutável
       IF status IN ('cancelled','failed') AND reactivatePolicy permite:
         UPDATE → pending (limpar skipped_reason, error_message)
         RETURN { reactivated: true }
       RETURN { existing }

  3. INSERT subscription_cycles
       status = 'pending' | 'queued' (se jobId no context)
       period_start/end = loadPeriodBounds()
       metadata.source = context.source
     ON CONFLICT (subscription_id, cycle_date) DO UPDATE
       (mesmas regras de subscriptionCyclesUpsertAfterScheduler — preservar invoiced)

  4. RETURN { cycleId, created: true|false }
```

Regras de reativação `cancelled` / `failed` **centralizadas aqui** — removidas de `subscriptionCycleRepairService` duplicado onde possível (5.0-23).

---

## Invariantes novos (complementam ADR-001)

| ID | Invariante | Válido após ADR-002 |
|----|------------|---------------------|
| **INV-11** | Toda competência **operacional** (Gerar, History real, NextInvoice não-projected) possui exatamente um `subscription_cycle` | **SIM** — por construção via ensure |
| **INV-12** | Nenhuma funcionalidade cria `subscription_cycle` diretamente | **SIM** — enforcement por code review + grep gate CI |
| **INV-13** | Toda criação inicial passa pelo Materializer | **SIM** |
| **INV-14** | Projection nunca cria competência | **SIM** — permanece UX-only |
| **INV-15** | Invoice nunca cria competência | **SIM** — invoice é efeito |
| **INV-16** | Scheduler e Manual usam o **mesmo** Materializer | **SIM** |
| **INV-17** | Aggregate nunca cria dados | **SIM** — read-only |
| **INV-18** | UI nunca cria dados | **SIM** — solicita API |

### Estados válidos (inalterados vs ADR-001)

| Estado | Válido? |
|--------|---------|
| `cycle` sem `invoice` | ✔ |
| `invoice` sem `cycle` (legado) | ✔ |
| `projection` sem `cycle` | ✔ **até** ensure explícito ou scheduler |
| Generate cria cycle automaticamente (via ensure) | ✔ **permitido** |
| Calendar cria cycle automaticamente | ✔ **opcional** (endpoint ensure) |

---

## Implementação sugerida (Sprint 5.0-23)

### Novo módulo

```
packages/backend/src/services/subscriptionCycleMaterializer.ts
```

**Refatoração interna (não rewrite):**

| Código legado | Destino |
|---------------|---------|
| `subscriptionCyclesUpsertAfterScheduler` | Corpo movido para `ensureSubscriptionCycle`; export legado deprecated |
| `insertOrReactivateRenewalJob` L396,L478,L521,L547 | Chamar `ensure` **antes** do INSERT job |
| `upsertCycleRow` (worker) | Mantém UPDATE lifecycle; INSERT inicial só se Materializer falhou (defesa) ou removido em fase 2 |
| `repairRecoverableSubscriptionCycles` | Delegar reativação ao Materializer |

### Chamadores obrigatórios

| Chamador | Arquivo atual | Mudança |
|----------|---------------|---------|
| Scheduler | `recurringBillingJobService.ts` `enqueueRenewalJobs` | ensure antes de insert job |
| tryEnqueue | `tryEnqueueRenewalJobForSubscriptionId` | ensure antes de insert job |
| Manual generate | `billingCycleInvoiceGenerationService.ts` | ensure no início (dueDate do ciclo) |
| Manual pós-advance | `billingManualRenewalService.ts` | ensure C+1 (substitui/complementa tryEnqueue-only) |
| PATCH next billing | `customerInvoiceRecurrenceNextBillingService.ts` | ensure após UPDATE subscription |
| Resume/Reactivate | `crmSubscriptionsLifecycleService.ts` | ensure |
| Runtime validator | `billingRuntimeValidator.ts` | ensure em gaps auditados |
| Contract patch | `crmSubscriptionsContractService.ts` | ensure quando datas mudam |

### API opcional (Calendar)

```
POST /api/crm-subscriptions/:id/ensure-cycle
Body: { due_date: "YYYY-MM-DD" }
Response: { cycle_id, cycle_date, status, created }
```

---

## Impacto por componente

| Componente | Mudança | Migration DB |
|------------|---------|----------------|
| **BillingAggregate** | **Nenhuma** | — |
| **UI React** | **Nenhuma obrigatória** | — |
| **Store / Refresh** | **Nenhuma** | — |
| **Scheduler** | ensure antes de job | — |
| **Manual Generate** | ensure no entry + pós-advance | — |
| **PATCH / Resume** | ensure | — |
| **Runtime validator** | ensure em gaps | — |
| **subscriptionCyclesDualWriteService** | Refatorar para Materializer | — |
| **Testes billing** | + materializer tests; atualizar parity 22E | — |
| **Golden `projection-only`** | Permanece válido **antes** de ensure | — |

---

## Compatibilidade

| Item | Requer? |
|------|---------|
| Nova tabela | **NÃO** |
| Nova migration | **NÃO** |
| Rebuild Billing Engine | **NÃO** |
| Rebuild Aggregate | **NÃO** |
| Rebuild Scheduler | **Refatoração** (mesmo comportamento + ensure explícito) |
| Recriar Store | **NÃO** |
| Breaking API | **NÃO** (ensure interno; endpoint calendar opcional) |

**Compatibilidade de dados:** `ON CONFLICT` existente garante idempotência com rows já criadas pelo dual-write legado.

---

## Benefícios

| Problema eliminado | Como |
|--------------------|------|
| projection vs cycle | ensure materializa antes de Gerar |
| scheduler vs manual | mesmo Materializer (INV-16) |
| invoice apagada | cycle permanece + reativação centralizada |
| cycle inexistente pós-advance | ensure C+1 síncrono |
| refresh inconsistente | GET sempre reflete rows criadas no POST |
| regras duplicadas | um módulo, um algoritmo |

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Materializar competências muito antecipadas | Política `source` + auditoria; calendar opcional |
| Duplicar lógica com `upsertCycleRow` worker | Fase 2: worker só UPDATE se row existe |
| Performance em GET validator | ensure só em gaps auditados, não todo GET |
| Conflito com lazy materialization ADR-001 | ADR-002 **refina** política: lazy para automação passiva; **ensure** para operações ativas |

---

## Definition of Done (Sprint 5.0-23)

- [ ] `SubscriptionCycleMaterializer` implementado com testes unitários + integração
- [ ] Zero `INSERT INTO subscription_cycles` fora do Materializer (grep gate CI)
- [ ] `subscriptionCyclesUpsertAfterScheduler` deprecated → delega ao Materializer
- [ ] Scheduler, Manual, PATCH, Resume, Runtime usam `ensureSubscriptionCycle`
- [ ] `npm run test:billing` verde
- [ ] Documentação ADR-002 status → **ACCEPTED**
- [ ] Legacy dual-write INSERT paths removidos ou redirecionados

---

## Diagrama alvo

```
                    ┌─────────────────────────────────────┐
                    │     SubscriptionCycleMaterializer    │
                    │     ensureSubscriptionCycle()        │
                    └─────────────────┬───────────────────┘
                                      │
          ┌───────────┬───────────────┼───────────────┬───────────┐
          ▼           ▼               ▼               ▼           ▼
    Scheduler    Manual Generate   PATCH/Resume   Runtime     Calendar API
          │           │               │          repair      (opcional)
          ▼           ▼               ▼               ▼           ▼
    insertJob     generateInvoice   tryEnqueue    audit+ensure  GET refresh
          │           │               │               │           │
          └───────────┴───────────────┴───────────────┴───────────┘
                                      │
                                      ▼
                          subscription_cycles (DB)
                                      │
                                      ▼
                          GET cycles_raw → BillingAggregate
                                      │
                                      ▼
                               UI (read-only)
```

---

## Relação ADR-001 ↔ ADR-002

| Pergunta | ADR |
|----------|-----|
| O que é competência? | **ADR-001** → `subscription_cycle` |
| Quem cria competência? | **ADR-002** → `SubscriptionCycleMaterializer` |
| Quem é gerável? | **ADR-001** → primeiro cycle elegível sem invoice |
| Quando nasce row? | **ADR-002** → `ensureSubscriptionCycle` em operações ativas |

---

**Próximo passo:** Implementação Sprint 5.0-23 (Legacy Removal) conforme checklist acima. Ratificação de **Calendar ensure** como endpoint opcional permanece decisão de produto.
