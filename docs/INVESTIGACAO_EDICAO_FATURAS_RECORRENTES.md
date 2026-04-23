# Investigação: edição de faturas recorrentes (CRM + Asaas)

**Escopo:** investigação e plano de correção — **sem implementação** neste documento.  
**Objetivo:** permitir edição segura de faturas ligadas a `subscriptions` (tipo `customer`), preservando billing manual, worker de recorrência, link público e gateway Asaas.

---

## 1. O que significa “fatura recorrente” neste código

### 1.1 Nascimento da primeira fatura e da assinatura

- `createRecurringManualInvoice` (`customerBillingService.ts`):
  1. Calcula `periodEnd` a partir de `due_date` + `billing_interval`.
  2. Cria linha em `subscriptions` (`type = 'customer'`, `next_billing_date = periodEnd`, `current_period_start/end` ligados ao primeiro ciclo).
  3. Cria a primeira fatura como **manual** (`createManualInvoice`).
  4. Chama `updateCustomerInvoiceSubscriptionLink`, que define:
     - `subscription_id`, `period_start`, `period_end`
     - `origin = 'subscription'`, `invoice_type = 'recurring'`

A primeira fatura deixa de ser “manual pura” e passa a ser tratada como **fatura de ciclo de assinatura**.

### 1.2 Próximas faturas do ciclo

- O **scheduler** (`enqueueRenewalJobs` em `recurringBillingJobService.ts`) seleciona assinaturas `active` com `next_billing_date <= CURRENT_DATE` e insere jobs em `billing_recurring_jobs` com `cycle_key = next_billing_date` (deduplicação por `(subscription_id, cycle_key)`).

- O **worker** (`processNextBatch`) processa jobs `pending`, recarrega a `subscription` e usa **`subscription.next_billing_date`** como `periodStart` da nova fatura (não usa `job.cycle_key` para o cálculo do período — o `cycle_key` serve principalmente à idempotência na fila).

- `processOneCustomerRenewalJob`:
  - Localiza a **fatura anterior** por `(subscription_id, current_period_start da subscription antes de avançar)` — ou seja, o último ciclo “fechado” no modelo atual.
  - Copia **apenas itens com `is_recurring = true`**, com regras de data (`scheduled_due_date`, E2 filhos, etc.).
  - Soma `total_cents` dos itens elegíveis → `amount_cents` da nova `customer_invoice`.
  - Cria cobrança no gateway (`createCharge`) quando há gateway ativo.
  - Chama `updateSubscriptionAfterRenewal` (avança `next_billing_date`, `current_period_*`, `billing_cycle_count`).

**Conclusão arquitetural:** o “molde” das próximas cobranças **não** é só `subscriptions.amount_cents`; para `type = customer`, o worker **deriva o valor e as linhas da próxima fatura a partir dos itens da fatura anterior** (último período processado). Alterar itens da fatura **atual em aberto** (antes do próximo job) é, portanto, o mecanismo natural para alterar valor/composição do **próximo** ciclo — desde que essa fatura seja a que o worker usará como “anterior” no momento certo (ver secção 6).

### 1.3 Separação conceitual (produto vs implementação)

| Conceito | Onde vive hoje |
|----------|----------------|
| Cobrança do **ciclo atual** (aberta) | `customer_invoices` + `customer_invoice_items` + opcionalmente `gateway_reference_id` |
| **Quando** rodar o próximo ciclo | `subscriptions.next_billing_date` (+ scheduler/jobs) |
| Metadados de período na assinatura | `subscriptions.current_period_start`, `current_period_end`, `billing_interval`, `billing_anchor_day` |
| Fila / idempotência | `billing_recurring_jobs` (`cycle_key`, status) |

**“Editar fatura recorrente não paga”** na prática = editar **esta** `customer_invoice` (e itens) + sincronizar cobrança Asaas se existir.  
**“Editar após pago”** (sem reabrir financeiro) = na prática editar **`subscriptions`** (principalmente `next_billing_date`; opcionalmente âncora/intervalo com mais cuidado) e eventualmente **ajustar itens recorrentes na última fatura paga** se a política de produto permitir “próximo ciclo” — com risco e testes extra.

---

## 2. Estados reais de `customer_invoices`

Constraint atual (migração `75_payment_status_check_multi_gateway.sql`):

`pending`, `waiting_payment`, `processing`, `paid`, `overdue`, `cancelled`, `failed`, `refunded`

### Editáveis pela rota administrativa atual

Em `customerInvoiceAdminService.ts`, `EDITABLE_STATUSES` =  
`pending`, `waiting_payment`, `processing`, `overdue`.

**`paid`, `refunded`, `cancelled`, `failed`:** o `PATCH` de edição “normal” **recusa** com *“Só é possível editar fatura pendente ou em cobrança”*.

---

## 3. Integração Asaas na edição (comportamento real)

### 3.1 Quando a cobrança existe

Se `gateway_reference_id` está preenchido:

1. Monta-se um patch (`amountCents`, `dueDate`, `description`) após eventual recálculo por itens.
2. Exige-se `gateway.updateCharge` — caso contrário erro explícito.
3. Para Asaas, `asaasService.updateCharge` → `toAsaasPaymentUpdate` mapeia `value`, `dueDate`, `description` (API de atualização de pagamento).

**Não há no CRM** validação prévia de “status RECEIVED no Asaas” antes do PATCH: se o Asaas recusar atualização, o erro sobe para o cliente da API.

### 3.2 Regras locais que afetam valor

- Se a fatura **tem linhas** e o body manda `amount_cents` **sem** `items`, o backend **bloqueia** (*“Fatura com itens: envie o array items atualizado…”*).
- Para `origin === 'subscription'`, o envio de **`items` está bloqueado** (erro dedicado) — logo, na prática **não** é possível recalcular total via substituição de itens por esta rota, e **também** não é possível ajustar só `amount_cents` com itens > 0.

**Corolário:** para fatura recorrente **com itens**, o fluxo atual impede ajuste de valor total pela API de patch (a menos que se remova o bloqueio de `items` ou se introduza outro caminho).

### 3.3 O que ainda pode ser alterado hoje (teoricamente via API) para `subscription` + não paga

Sem enviar `items` nem `amount_cents`: **vencimento** (`due_date`), **descrição**, **payment_method**, **allowed_payment_methods** — e, se houver cobrança, isso dispara `updateCharge` com subset permitido.

---

## 4. O que bloqueia a edição hoje (causa raiz)

### 4.1 Backend

1. **`origin === 'subscription'` + `body.items`** → erro explícito em `patchCustomerInvoiceWithGateway`.
2. **Fatura com itens + `amount_cents` sem `items`** → erro (combinado com (1) impede mudar valor).
3. **Status fora de `EDITABLE_STATUSES`** → não edita (inclui `paid`).
4. **Exclusão:** `deleteCustomerInvoiceWithGateway` recusa `origin === 'subscription'`.

### 4.2 Frontend

Em `CustomerInvoiceNew.tsx`, ao carregar fatura em modo edição, se `inv.origin === 'subscription'`:

- toast *“Faturas geradas pela assinatura não podem ser editadas nesta tela.”*
- redireciona para o detalhe.

Ou seja: **mesmo que** a API permitisse parcialmente edição sem itens, a UI **impede** abrir o formulário de edição.

### 4.3 UX do detalhe

`CustomerInvoiceDetail.tsx` mostra o botão **Editar** para qualquer fatura “actionable” (`INVOICE_ACTIONABLE`), **sem** excluir `origin === 'subscription'`. O utilizador clica e é **repelido** na rota de edição — experiência inconsistente.

### 4.4 Intencionalidade

O bloqueio de **itens** para `subscription` é **intencional** no código (mensagem orienta cancelar e criar nova). Provável motivação histórica: evitar dessincronia com o motor que **copia itens** do ciclo anterior sem tratar edge cases.

O bloqueio da **UI** é **intencional** (hard redirect).

**Não** é apenas “falta de botão”: há **dupla barreira** (UI + API para itens/valor).

---

## 5. Política segura proposta (produto + técnica)

### 5.1 Fatura recorrente **não paga** (`EDITABLE_STATUSES` + `origin = subscription`)

**Objetivo:** equivalência funcional à edição de fatura manual, respeitando gateway.

| Campo / ação | Política recomendada |
|---------------|---------------------|
| Itens (incl. `is_recurring`, intervalos, `scheduled_due_date`) | **Permitir** com implementação dedicada: atualizar `customer_invoice_items`, recalcular `amount_cents`, depois **`updateCharge`** no Asaas com o novo valor. |
| `due_date` | **Permitir**; sincronizar Asaas (`dueDate`) quando houver `gateway_reference_id`. |
| `description` / observações | **Permitir**; sincronizar descrição na cobrança quando fizer sentido. |
| Métodos de pagamento / permitidos no link | **Permitir** com as mesmas regras atuais; validar limites do Asaas para o estado da cobrança (ex.: troca de billing type pode ser restrita — tratar erro do gateway como 400/502 documentado). |
| Cancelar fatura | Já suportado em parte (cancela gateway + status); manter coerência com recorrência (não “apagar” subscription automaticamente — decisão de produto). |

**Sincronização Asaas:** para cobrança **ainda não liquidada**, atualizar valor/vencimento/descrição via API de update é o caminho **alinhado** ao que o CRM já faz para faturas manuais. **Recriar** cobrança só seria necessário em casos extremos (recusa do Asaas); aí definir política explícita (cancelar + nova cobrança + novo `gateway_reference_id`) com cuidado com webhooks e `payment_token`.

### 5.2 Fatura recorrente **já paga** (`paid` / eventualmente `refunded`)

**Princípio:** não alterar registos financeiros da invoice liquidada nem a cobrança histórica no Asaas.

| Necessidade | Onde agir |
|-------------|-----------|
| Adiar / antecipar **próxima** cobrança | Atualizar `subscriptions.next_billing_date` (e revisar consistência com `current_period_end` na UI — ver riscos). |
| Alterar valor/composição dos **próximos** ciclos | Preferencialmente: **última fatura paga** ainda é o “template” do worker? **Não** — o worker usa a fatura cujo `period_start` = `subscription.current_period_start`. Após o pagamento/renovação, o “último ciclo gravado na subscription” é a fatura recém-gerada ou a anterior conforme estado. **Política segura:** expor fluxo “alterar base do próximo ciclo” como edição **assistida** (ex.: próxima invoice em rascunho) ou edição controlada dos itens na fatura **atual em aberto** do próximo ciclo quando ela já existir; **evitar** editar linhas de fatura `paid` salvo requisito legal e auditoria. |
| Só mudar data | Endpoint ou secção UI “**Alterar próxima cobrança**” → PATCH na `subscription` (tenant + cliente), com validações. |

### 5.3 O que **não** fazer sem desenho extra

- Alterar `paid_at` / status de invoice paga para “reabrir” edição na mesma rota.
- Apagar faturas `origin = subscription` sem cancelar assinatura / tratar jobs.
- Mudar `subscription_id` ou `period_start` da invoice à mão sem alinhar jobs e gateway.

---

## 6. Impacto em jobs, `next_billing_date` e ciclos

### 6.1 Job pendente vs `next_billing_date` adiada

O worker, ao processar o job, se **`subscription.next_billing_date > CURRENT_DATE`** (no PG), **cancela** o job com outcome `CANCELLED_NEXT_BILLING_AFTER_DB_TODAY`.

**Implicação positiva:** adiar `next_billing_date` para depois de “hoje” **não deixa** jobs antigos gerarem fatura indevida — são cancelados de forma controlada.

### 6.2 Antecipar cobrança

Se `next_billing_date` for antecipada para `<= CURRENT_DATE`, o **scheduler** volta a enfileirar (se ainda não existir job pendente para aquele `cycle_key`). Há salvaguarda de **invoice já existente** para o mesmo `(subscription, period_start)` → caminho idempotente reutiliza fatura e avança subscription.

### 6.3 Consistência `current_period_*` vs `next_billing_date` manual

Hoje, após renovação bem-sucedida, `next_billing_date` e `current_period_end` avançam em conjunto pelo worker. Uma edição manual **só** de `next_billing_date` pode criar **lacuna visual** entre `current_period_end` e a próxima data desejada até o próximo job. Recomenda-se, na implementação, **função de domínio** que atualize `next_billing_date` (e documente se também ajusta `current_period_end` para manter invariantes de UI).

### 6.4 `cycle_key` vs estado real

O job pode ter sido enfileirado com `cycle_key` antigo; o processamento usa o estado **atual** da subscription. Isso é em geral **bom** para resilência, mas exige **logs claros** ao implementar mudanças manuais de data.

---

## 7. UI necessária (recomendação)

1. **Editar fatura atual** (só não paga): reutilizar fluxo `CustomerInvoiceNew` em modo edição para `origin === 'subscription'`, com textos que deixem claro que altera **esta cobrança** e a **base** copiada no próximo ciclo (quando aplicável).
2. **Recorrência / próxima cobrança** (incl. quando última fatura está paga): bloco dedicado (já existe insight/histórico) + ação **“Alterar próxima data de cobrança”** que chama API na `subscription`, não no PATCH da invoice paga.
3. No detalhe: ou **ocultar** “Editar” para subscription até suportar, ou **redirecionar** para um wizard que distinga “fatura” vs “assinatura”.

---

## 8. Riscos (resumo)

| Risco | Mitigação |
|-------|-----------|
| Asaas recusa update (status da cobrança) | Tratar erro; opcionalmente fluxo de substituição de cobrança com idempotência e webhook. |
| Dessincronia valor CRM vs Asaas | Transação + `updateCharge` após persistência local; testes com PIX/BOLETO/CARTÃO. |
| Edição de itens altera próximo ciclo de forma inesperada | Texto de UI + documentação; opcional “avisar que próxima renovação usará estas linhas”. |
| Alteração manual de `next_billing_date` | Usar função de domínio; confiar no cancelamento de jobs obsoletos já existente. |
| E2 / faturas filhas | Regressão em itens com `scheduled_due_date` — testar com flag `BILLING_CHILD_ITEM_INVOICES_ENABLED`. |

---

## 9. Plano de implementação sugerido (etapas)

1. **Backend — fatura `subscription` não paga:** remover ou substituir o bloqueio de `items` por regras finas (ex.: só se status editável; validar totais); manter `replaceManualInvoiceLineItems` + `updateCharge` na mesma ordem lógica que manual.
2. **Frontend:** permitir abrir `/customer-invoices/:id/edit` para `origin === 'subscription'` quando status actionável; alinhar mensagens e `canDelete`/ações.
3. **Detalhe da fatura:** alinhar botão Editar com as regras acima (evitar clique que leva a toast de erro).
4. **Assinatura — próxima data (fatura paga):** novo endpoint `PATCH /subscriptions/:id` (ou sub-rota sob fatura) restrito a `type=customer`, tenant, validação de data mínima/máxima; testes com jobs pendentes (adiantar/atrasar).
5. **(Opcional)** “Alterar base do próximo ciclo” sem editar invoice paga: avaliar tabela template futura ou edição da **próxima** invoice já criada em `pending` — só se o produto exigir; caso contrário documentar que o operador edita a invoice **aberta** do ciclo atual.
6. **QA / produção:** cenários Asaas (valor, vencimento, descrição), webhook de confirmação, link público (`payment_token`), idempotência de jobs.

---

## 10. Arquivos analisados (esta investigação)

- `packages/backend/src/services/customerBillingService.ts` — `createRecurringManualInvoice`
- `packages/backend/src/services/customerInvoiceService.ts` — `createCustomerInvoice`, `updateCustomerInvoiceSubscriptionLink`, `replaceManualInvoiceLineItems`
- `packages/backend/src/services/customerInvoiceAdminService.ts` — `patchCustomerInvoiceWithGateway`, `deleteCustomerInvoiceWithGateway`
- `packages/backend/src/controllers/customerInvoicesController.ts` — `patchBodySchema`, `updateCustomerInvoice`
- `packages/backend/src/services/recurringBillingJobService.ts` — `enqueueRenewalJobs`, `processNextBatch`, `processOneCustomerRenewalJob`
- `packages/backend/src/services/billingSubscriptionService.ts` — `createSubscription`, `updateSubscriptionAfterRenewal`
- `packages/backend/src/modules/gateways/asaas/services/asaasService.ts` — `updateCharge`
- `packages/backend/src/modules/gateways/asaas/mappers/asaasMapper.ts` — `toAsaasPaymentUpdate`
- `src/pages/CustomerInvoiceNew.tsx` — bloqueio de edição `origin === 'subscription'`
- `src/pages/CustomerInvoiceDetail.tsx` — botão Editar
- `src/lib/customerInvoiceActions.ts` — `INVOICE_ACTIONABLE`
- `database/init/75_payment_status_check_multi_gateway.sql` — domínio de `status`

---

## 11. Respostas diretas aos objetivos do pedido

| Pergunta | Resposta |
|----------|----------|
| Editar invoice atual vs assinatura? | **Não paga:** principalmente invoice + itens + gateway. **Paga:** principalmente `subscriptions.next_billing_date` (e política explícita para “base futura”). |
| O que bloqueia hoje? | **UI** (redirect) + **API** (bloqueio de `items` + regra amount/items) + status `paid` não editável. |
| Asaas deve sincronizar em não paga? | **Sim** para valor/vencimento/descrição quando existe cobrança e o update é aceito — mesmo padrão das faturas manuais. |
| Ordem segura? | (1) desbloquear edição completa não paga + gateway, (2) UI, (3) PATCH subscription para próxima data com jobs existentes, (4) refinamentos UX/“base do próximo ciclo”. |

Documento complementar de caminhos de código: `docs/MAPA_TECNICO_EDICAO_RECORRENCIA_E_FATURA.md`.
