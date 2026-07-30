# Plano — Ciclos, Pix Automático (`finishDate`) e Gerar próxima

| Campo | Valor |
|-------|-------|
| **Data** | 2026-07-30 |
| **Tipo** | Plano de implementação (3 sprints) |
| **Escopo** | Assinaturas CRM (`type=customer`) + auth Pix Automático Asaas |
| **Pré-requisito** | [`SPRINT_FIX_FIRST_INVOICE_CYCLE_CANCEL.md`](./SPRINT_FIX_FIRST_INVOICE_CYCLE_CANCEL.md) (A+B+C — 1ª fatura no ciclo + cancelar) |
| **Status** | Sprints 1–3 ✅ entregues |

---

## 1. Resumo executivo

Após o fix A (1ª fatura materializa `subscription_cycles`), o histórico/calendário passam a mostrar a cobrança inicial, mas a **próxima competência gerável** deixa de aparecer de forma acionável. Em paralelo, a config de ciclos na UI está incompleta, o Asaas cria auth **sem** `finishDate` (prazo indeterminado), e o `max_cycles` ainda não governa calendário/worker nem o closeout da assinatura.

Este plano cobre **5 pontos** em **3 sprints**, com decisões de produto fechadas sobre edição de ciclos, fim natural (**Finalizada**) vs cancelamento do operador (**Encerrada**), e o que vai (ou não) para o Asaas.

---

## 2. Os 5 pontos

| # | Pedido | Problema hoje | Destino |
|---|--------|---------------|---------|
| **1** | Enviar `finishDate` no Asaas conforme ciclos | `createPixAutomaticAuthorization` não envia `finishDate` → auth indeterminada | Ilimitado: omitir; finito: data da última competência |
| **2** | Resumo de ciclos na edição | Bloco só tem switch + input absoluto; resumo inconsistente | Mostrar corretamente `atual / total` ou `atual / ∞` |
| **3** | Edição só por inclusão (+N) | PATCH aceita qualquer `max_cycles` (pode reduzir) | UI “Adicionar ciclos”; backend bloqueia reduzir abaixo do consumido |
| **4** | Bug / enforce `max_cycles` | Calendário/projeção ~12; worker não respeita bem o teto | Projeção, calendário e worker param no máximo; closeout **Finalizada** |
| **5** | Gerar próxima sumiu | Fix A só liga ciclo `invoiced`; não seeda C+1 (padrão 23E) | Materializar `next_billing_date` como `pending` após 1ª fatura |

---

## 3. Modelo de relação (SSOT)

Três camadas:

| Camada | Onde | Papel |
|--------|------|--------|
| **Contrato** | `subscriptions.cycles_unlimited` / `max_cycles` | Intenção: ∞ ou no máximo N cobranças (N inclui as já emitidas) |
| **Execução** | `subscription_cycles` (+ `customer_invoices`) | Competências reais (1, 2, 3…) — histórico, Gerar, calendário acionável |
| **Agenda** | `subscriptions.next_billing_date` | Próxima data a materializar / renovar |

```text
Assinatura (max=12 ou ∞)
    │
    ├─ ciclo 1  invoiced  ← 1ª fatura (já entregue no fix A)
    ├─ ciclo 2  pending   ← “Gerar próxima” (Sprint 1)
    ├─ … até max
    └─ Asaas Pix Auto auth
         • finito  → finishDate = due da última competência
         • ∞       → sem finishDate
```

**Contagem “atual”:** ciclos com fatura ligada (`invoice_id`) / emitidos — não só “pagos” na timeline.

---

## 4. Decisões de produto (fechadas)

### D1 — Edição de ciclos (+N)

- Operador **não** reescreve o total livremente; só **adiciona** (ex.: +2, +3).
- Backend: `new_max >= max(max_atual, ciclos_consumidos)`.
- **Não** cancela assinatura.
- **Não** cancela auth Pix Auto no Asaas.
- Sprint 3: ao estender, **estende** `finishDate` se auth ativa e API permitir.

### D2 — Encerrar assinatura (operador)

- Já implementado (CRM5): `cancelCrmCustomerSubscription` (imediato **ou** fim do período) chama `cancelPixAutomaticAuthorizationForCrmSubscription` → `DELETE` no Asaas.
- Label UX: **Encerrada / Cancelada** (intenção humana).
- Nota: hoje o modo “fim do período” também cancela a auth **na hora do pedido**. Manter nesta onda; eventual adiamento até o último vencimento = decisão futura explícita.

### D3 — Fim natural dos ciclos (`max_cycles` atingido)

- Status de produto: **Finalizada** (não “Cancelada”).
- Preferência técnica: status `completed` **ou**, se migration for cara: `cancelled` + `ended_reason = 'cycles_exhausted'` com UI sempre **Finalizada**.
- Momento: após gerar com sucesso a **N-ésima** fatura (não criar N+1).
- Asaas: cancelar auth com reason `cycles_exhausted` / `subscription_completed` (mesmo helper `DELETE`, reason distinto do cancel manual).

### D4 — O que **não** cancela Pix Auto no Asaas

| Evento | Cancela auth? |
|--------|----------------|
| Editar ciclos (+N / ∞) | **Não** |
| Pagar fatura do ciclo | **Não** (só charge avulso do ciclo, se aplicável) |
| Desligar switch Pix Auto | **Sim** (já) |
| Encerrar assinatura (operador) | **Sim** (já) |
| Atingir `max_cycles` (Finalizada) | **Sim** (Sprint 3) |

---

## 5. Visão das 3 sprints

```text
Sprint 1 (P0)  →  #5 Gerar próxima
Sprint 2 (P1)  →  #2 + #3 UX/regras de ciclos
Sprint 3 (P1)  →  #1 finishDate + #4 enforce + Finalizada
```

Dependências: Sprint 1 independente; Sprint 3 precisa do contrato/regras da Sprint 2 estáveis.

---

## 6. Sprint 1 — Gerar próxima (ponto 5)

| Campo | Valor |
|-------|-------|
| **Prioridade** | P0 |
| **Risco** | Baixo (padrão já existe no renewal manual 23E) |
| **Tamanho** | Sprint curta (≈1–2 dias) |

### Objetivo

Após criar assinatura + 1ª fatura, a UI volta a mostrar a **próxima competência com Gerar cobrança** (card / histórico / calendário acionável), não só “Previsão” projetada.

### Causa

- Fix A: `attachCustomerInvoiceToSubscriptionCycle` → só ciclo da 1ª data como `invoiced`.
- Sem ciclo `pending` em `next_billing_date`, OCRE cai em `PROJECTION_ONLY`.
- NextInvoiceCard: `showAction` exige `!isProjected` → sem botão Gerar.
- Histórico: só eventos reais com `cycleId` → projeções não entram como linha gerável.
- Renewal manual já faz `materializePlannedCycles` pós-sucesso; o **create** da assinatura não.

### Escopo

1. Em `createRecurringManualInvoice`, **depois** do attach da 1ª fatura, materializar `subscription.next_billing_date` via `materializePlannedCycles` (espelhar 23E).
2. Respeitar `max_cycles` / ilimitado: se já esgotou (ex. `max_cycles = 1`), **não** seedar C+1.
3. Idempotente; fail-open (warn) para não quebrar criação.
4. (Opcional na mesma sprint) Repair lazy no GET: se só existe ciclo da 1ª e falta C+1 elegível, seed idempotente.
5. Testes unitários + aceite manual.

### Fora de escopo

- Asaas `finishDate`, UX de edição de ciclos, status Finalizada.

### Aceite

- [x] Nova assinatura + 1ª fatura → histórico: ciclo 1 `invoiced` **e** ciclo 2 `pending` (sem `invoice_id`), quando `max > 1` ou ilimitado.
- [x] NextInvoiceCard / histórico: botão **Gerar cobrança** na competência de `next_billing_date` (ciclo real pending).
- [x] Calendário: mesma competência gerável (não só projetada).
- [x] `max_cycles = 1`: não cria ciclo 2.

### Entregue (2026-07-30)

| Item | Implementação |
|------|----------------|
| Seed C+1 no create | `createRecurringManualInvoice` → `seedNextPendingCycleIfEligible` após attach |
| Helper | `seedNextPendingCycleIfEligible` em `crmSubscriptionInvoiceCycleLink.ts` |
| `max_cycles` | Skip se `consumed >= max_cycles` (não ilimitado) |
| Repair / GET | Seed no fim do repair órfãs + lazy no `getCrmSubscriptionDetail` se falta pending |
| Testes | `crmSubscriptionInvoiceCycleLink.test.ts` (5 casos) |

### Ficheiros

- `packages/backend/src/services/crm/crmSubscriptionInvoiceCycleLink.ts` (+ `.test.ts`)
- `packages/backend/src/services/customerBillingService.ts`
- `packages/backend/src/services/crmSubscriptionsService.ts`

---

## 7. Sprint 2 — Resumo e edição de ciclos (pontos 2 e 3)

| Campo | Valor |
|-------|-------|
| **Prioridade** | P1 |
| **Risco** | Médio (produto + validação) |
| **Tamanho** | 1 sprint |

### Objetivo

Operador vê o progresso correto e só consegue **aumentar** o teto de ciclos (ou ir a ∞), sem cancelar assinatura nem Pix Auto.

### Escopo

1. **Resumo SSOT** no bloco “Configurar ciclos” (detalhe da assinatura):
   - Finito: `N de M` (ex.: `3 de 12`).
   - Ilimitado: `N / ∞`.
   - Base de N = ciclos emitidos / com `invoice_id` (alinhar com `computeSubscriptionProgress` se estiver contando só “paid”).
2. **UI de edição:** controle “Adicionar ciclos” (+1, +3, custom ≥ 1), não input absoluto livre que reescreve o total.
3. **Backend** `patchCrmSubscriptionCyclesConfig` / `patchSubscriptionCyclesConfig`:
   - `new_max >= max(max_atual, ciclos_consumidos)`.
   - Proibir reduzir abaixo do já usado.
   - ∞ → finito só se `max >= consumidos`.
4. Testes de API + UI smoke.

### Fora de escopo

- Envio/`update` de `finishDate` no Asaas (Sprint 3).
- Enforce no worker/calendário (Sprint 3).

### Aceite

- [x] Resumo correto com 0, 1 e N ciclos emitidos; ∞ mostra infinito.
- [x] +3 sobe `max_cycles` em 3; tentativa de reduzir abaixo do consumido → 400.
- [x] Editar ciclos **não** altera `status` da assinatura e **não** chama cancel Asaas.

### Entregue (2026-07-30)

| Item | Implementação |
|------|----------------|
| Regras backend | `assertCyclesConfigPatchAllowed` — não reduzir max; floor = emitidos |
| PATCH | `patchSubscriptionCyclesConfig` conta `invoice_id` e valida |
| Resumo UI | Progresso `N de M` / `N / ∞` no bloco Configurar ciclos |
| Edição | Finito: +1 / +3 / custom; ∞→finito: definir limite ≥ emitidos |
| Progress header | `computeSubscriptionProgress` usa ciclos emitidos (não só pagos) |
| Testes | `crmSubscriptionCyclesConfigRules.test.ts` + `subscriptionCyclesContract.test.ts` |

### Ficheiros

- `packages/backend/src/services/crm/crmSubscriptionCyclesConfigRules.ts` (+ `.test.ts`)
- `packages/backend/src/services/billingSubscriptionService.ts`
- `src/lib/subscriptionCyclesContract.ts` (+ `.test.ts`)
- `src/lib/subscriptionFinancialExperience.ts`
- `src/pages/SubscriptionDetail.tsx`

---

## 8. Sprint 3 — `finishDate` Asaas + enforce + Finalizada (pontos 1 e 4)

| Campo | Valor |
|-------|-------|
| **Prioridade** | P1 |
| **Risco** | Alto (API externa + renovação) |
| **Tamanho** | 1 sprint (pode esticar se update de auth for limitado) |

### Objetivo

Gateway e motor interno alinhados ao contrato de ciclos; fim natural vira **Finalizada** e limpa auth no Asaas.

### Escopo

#### 8.1 `finishDate` (ponto 1)

1. Estender `createPixAutomaticAuthorization` (client Asaas) com `finishDate` opcional.
2. CRM + SaaS no start da auth:
   - Ilimitado → **omitir** `finishDate`.
   - Finito → due da **última** competência: a partir de `startDate`/`due` + `(remaining - 1) * intervalo` (ou last due a partir de `max_cycles - já_consumidos` se auth no meio da vida).
3. Ao **estender** ciclos (+N) com auth ativa: atualizar vigência no Asaas **se** a API permitir; senão documentar limitação + política (ex.: só vale para novas auth / ops manual).

#### 8.2 Enforce `max_cycles` (ponto 4)

1. Calendário / `buildFutureCycles` / projeções Aggregate respeitam o teto.
2. Worker / renewal **não** gera além de N.
3. Após N-ésima fatura gerada: marcar assinatura **Finalizada** (D3) e cancelar auth Asaas (`cycles_exhausted`).

#### 8.3 Testes

- Create auth com/sem `finishDate`.
- Projeção para em N.
- Job não cria N+1.
- Closeout Finalizada + audit reason distinto de cancel manual.

### Fora de escopo

- Mudar timing do cancel Asaas no “encerrar no fim do período” (operador) — manter comportamento atual salvo decisão futura.

### Aceite

- [x] Auth finita no Asaas com `finishDate`; ilimitada sem o campo.
- [x] Calendário não projeta além de `max_cycles`.
- [x] Worker não gera N+1; assinatura fica **Finalizada**.
- [x] Auth cancelada no Asaas no closeout natural (reason `cycles_exhausted`).
- [x] +N não cancela auth; **update de `finishDate` no Asaas não suportado nesta onda** (só na criação da auth).

### Entregue (2026-07-30)

| Item | Implementação |
|------|----------------|
| Migration | `306_subscriptions_completed_cycles_exhausted.sql` — status `completed` + `ended_reason` |
| `finishDate` | `createPixAutomaticAuthorization` + CRM/SaaS start auth |
| Cálculo | `computePixAutomaticFinishDateYmd` |
| Enforce projeção | `buildFutureCycles` + Aggregate `buildProjectionEventsFromAggregate` |
| Enforce worker | Scheduler SQL + `describeRenewalEnqueue` + advance pós-ciclo |
| Closeout | `completeCustomerSubscriptionIfCyclesExhausted` → `completed` + cancel Pix Auto |
| UI | Headline **Finalizada** |

### Nota Asaas (update finishDate)

A API pública documentada cobre `finishDate` na **criação**. Não há endpoint estável de update de vigência nesta sprint: ao **+N** ciclos, o contrato interno sobe; auth já ativa no Asaas **não** é reescrita. Novas auth (re-enable) nascem com `finishDate` correto.

### Patch follow-up (2026-07-30) — generate manual / calendário

Gap residual após Sprint 3: scheduler respeitava `max_cycles`, mas **Gerar cobrança** + `materializePlannedCycles(next)` pós-manual ainda seedavam C+1.

| Fix | Onde |
|-----|------|
| Prefixo generate | `manualGenerateRenewalNow` → `customerSubscriptionHasRemainingChargeSlots` |
| Pós-sucesso | `seedNextPendingCycleIfEligible` (já checa max) + closeout Finalizada |
| UI Gerar | `subscriptionAllowsNewChargeGeneration` em history/calendar/capabilities/Next FAB |

---

## 9. Aceite global (fim das 3 sprints)

1. Auth Pix Auto finita no Asaas com `finishDate`; ilimitada sem o campo.
2. Edição mostra `N de M` ou `N / ∞` corretamente.
3. Só é possível **aumentar** ciclos (+N); nunca reduzir abaixo do consumido.
4. Calendário/worker respeitam `max_cycles`; fim natural → **Finalizada** + cancel auth.
5. Após criar assinatura + 1ª fatura, **Gerar próxima** volta no card/histórico.

---

## 10. Ordem e o que não fazer numa sprint só

| Alternativa | Quando |
|-------------|--------|
| **3 sprints (recomendado)** | Entrega segura: P0 primeiro; Asaas por último |
| **2 sprints** | S1 = #5+#2+#3; S2 = #1+#4 — mais risco na S1 |
| **4 sprints** | Separar create `finishDate` do enforce/closeout |

**Não** juntar os 5 pontos numa única sprint: mistura seed de ciclo, UX, validação e API Asaas.

---

## 11. Referências

- Fix 1ª fatura + cancel: [`SPRINT_FIX_FIRST_INVOICE_CYCLE_CANCEL.md`](./SPRINT_FIX_FIRST_INVOICE_CYCLE_CANCEL.md)
- Post-manual materialize C+1: [`SPRINT_5.0-23E_BEHAVIOR_COMPLETION_REPORT.md`](./SPRINT_5.0-23E_BEHAVIOR_COMPLETION_REPORT.md)
- Visibilidade Gerar: [`SPRINT_5.0-23F_GENERATE_VISIBILITY_CERTIFICATION.md`](./SPRINT_5.0-23F_GENERATE_VISIBILITY_CERTIFICATION.md)
- CRM Pix Auto cancel auth: `cancelPixAutomaticAuthorizationForCrmSubscription` (CRM5)
- Asaas: campo `finishDate` em [Criar autorização Pix Automático](https://docs.asaas.com/reference/criar-uma-autorizacao-pix-automatico)

---

## 12. Checklist de arranque (Agent)

- [x] Sprint 1 implementada + closeout curto
- [x] Sprint 2 implementada + closeout curto
- [x] Sprint 3 implementada + closeout + nota Asaas (update finishDate suportado ou não)
- [x] Patch — generate manual + seed C+1 respeitam max_cycles (calendário/Gerar)
- [ ] Atualizar release note quando for para deploy
