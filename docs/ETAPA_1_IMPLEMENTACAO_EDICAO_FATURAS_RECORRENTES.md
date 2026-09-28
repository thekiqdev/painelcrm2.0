# Etapa 1 — Implementação: edição de faturas recorrentes

Documento de entrega incremental alinhado ao pedido de correção (UI + backend + próxima renovação).

---

## 1. Bloqueios removidos ou alterados

### 1.1 UI (`src/pages/CustomerInvoiceNew.tsx`)

- **Removido:** redirecionamento quando `inv.origin === "subscription"` (toast que impedia abrir a edição).
- **Adicionado:**
  - Fluxo **`renewal`**: se a fatura é `origin === "subscription"` e **`status === "paid"`**, a rota `/customer-invoices/:id/edit` mostra apenas o cartão **“Alterar próxima renovação”** (data `next_billing_date` na assinatura), sem formulário de itens/valor da cobrança já liquidada.
  - Fluxo **`invoice`**: fatura recorrente em estado **editável** (`INVOICE_ACTIONABLE`) abre o formulário completo, com **alerta** explicando que se trata da cobrança atual da recorrência.
  - Se a recorrente **não** está editável (ex.: cancelada) e não está paga, mantém-se redirecionamento com toast.

### 1.2 UI (`src/pages/CustomerInvoiceDetail.tsx`)

- Botão **Editar** para recorrente editável: texto **“Editar cobrança atual”** (manual continua **“Editar”**).
- Novo botão **“Alterar próxima renovação”** quando `origin === "subscription"`, `status === "paid"` e há `subscription_id` (navega para a mesma rota de edição, que abre o modo `renewal`).

### 1.3 Backend (`packages/backend/src/services/customerInvoiceAdminService.ts`)

- **Removido:** o `throw` que impedia `body.items` quando `inv.origin === 'subscription'`.
- **Mantido:** `EDITABLE_STATUSES`, regra “fatura com itens não pode mandar só `amount_cents`”, `updateCharge` quando existe `gateway_reference_id`, e demais regras para faturas manuais (sem regressão intencional).

---

## 2. Nova API — próxima cobrança (fatura paga)

- **Rota:** `PATCH /api/customer-invoices/:id/recurrence/next-billing`
- **Body:** `{ "next_billing_date": "YYYY-MM-DD" }`
- **Serviço:** `packages/backend/src/services/customerInvoiceRecurrenceNextBillingService.ts`
- **Regras:**
  - Fatura existe no tenant, `origin === 'subscription'`, `status === 'paid'`, com `subscription_id`.
  - Assinatura `type === 'customer'`, `status === 'active'`, mesmo `tenant_id`.
  - `UPDATE subscriptions SET next_billing_date = ...`
  - **Jobs:** todos os registos em `billing_recurring_jobs` com `subscription_id` e `status = 'pending'` são marcados `cancelled`, com `completion_outcome = cancelled_manual_next_billing_reschedule` (quando a coluna existe).
- **Auditoria:** `billingLog('invoice', 'customer_subscription_next_billing_manual', { ... })` com tenant, invoice, subscription, datas anterior/nova, contagem de jobs cancelados e `actor_user_id` quando disponível.

---

## 3. Edição da recorrente **não paga**

- Utiliza o mesmo `PATCH /api/customer-invoices/:id` e `patchCustomerInvoiceWithGateway`.
- Permite **itens**, **valor** (via itens ou valor único), **vencimento**, **descrição**, métodos — como fatura manual editável.
- Com cobrança no gateway: continua **`gateway.updateCharge`** (Asaas: `value`, `dueDate`, `description` via código existente).

---

## 4. Alteração da próxima renovação (recorrente **paga**)

- Não altera `customer_invoices` nem chama o gateway sobre a cobrança liquidada.
- Altera apenas `subscriptions.next_billing_date` e cancela jobs `pending` obsoletos.
- O **worker** existente continua a cancelar jobs quando `subscription.next_billing_date > CURRENT_DATE` no momento do processamento (`CANCELLED_NEXT_BILLING_AFTER_DB_TODAY`); o cancelamento explícito de `pending` ao reagendar reduz fila “fantasma” após mudança manual.

---

## 5. Sincronização Asaas

| Cenário | Comportamento |
|---------|----------------|
| Recorrente não paga + alteração de valor/vencimento/descrição + `gateway_reference_id` | `updateCharge` → `asaasClient.updatePayment` (inalterado). |
| Recorrente paga + alterar próxima data | Sem chamada ao Asaas (só assinatura local). |

---

## 6. Jobs e `next_billing_date`

- Ao guardar a nova data via API dedicada: **cancelamento em massa** dos jobs `pending` daquela assinatura.
- **Outcome novo:** `cancelled_manual_next_billing_reschedule` em `BILLING_RECURRING_JOB_OUTCOME` (`recurringBillingJobService.ts`).
- O scheduler volta a enfileirar quando `next_billing_date <= CURRENT_DATE` (comportamento já existente).

---

## 7. Frontend — serviço

- `src/services/customerInvoices.ts`: método `updateRecurrenceNextBilling(id, { next_billing_date })` e tipo `CustomerInvoiceRecurrenceNextBillingResult`.

---

## 8. Riscos remanescentes

- **Asaas:** cobranças em estados que a API Asaas não permite atualizar continuam a falhar com erro do provedor (comportamento já existente no patch).
- **`current_period_*` vs `next_billing_date`:** esta etapa só altera `next_billing_date`; pode haver desalinhamento visual até o próximo job — documentado na investigação anterior; evolução futura opcional com função de domínio.
- **Itens “próximo ciclo” com fatura paga:** não implementado nesta etapa (baixo risco foi priorizar só a data); evolução possível com endpoint/UI adicional.

---

## 9. Checklist de aceite (referência)

- [x] Tela de edição deixa de bloquear `origin = subscription` (casos permitidos).
- [x] Recorrente não paga: itens/valor/vencimento pelo patch existente.
- [x] Recorrente não paga: sync Asaas mantido quando há cobrança.
- [x] Recorrente paga: não altera histórico da fatura nem cobrança no gateway.
- [x] Recorrente paga: alterar próxima cobrança via nova rota + UI dedicada.
- [x] Jobs `pending` cancelados ao reagendar; worker/scheduler preservados.
- [x] Faturas manuais: sem mudança de regra além de remover o bloqueio específico de itens em subscription.

---

## 10. Ficheiros alterados / novos

| Ficheiro | Alteração |
|----------|-----------|
| `packages/backend/src/services/customerInvoiceAdminService.ts` | Remove bloqueio de `items` para `origin === subscription`. |
| `packages/backend/src/services/customerInvoiceRecurrenceNextBillingService.ts` | **Novo** — atualização de `next_billing_date` + cancelamento de jobs. |
| `packages/backend/src/services/recurringBillingJobService.ts` | Novo outcome `CANCELLED_MANUAL_NEXT_BILLING_RESCHEDULE`. |
| `packages/backend/src/controllers/customerInvoicesController.ts` | Handler `patchCustomerInvoiceRecurrenceNextBilling`. |
| `packages/backend/src/routes/customerInvoicesRoutes.ts` | `PATCH /:id/recurrence/next-billing` antes de `PATCH /:id`. |
| `src/services/customerInvoices.ts` | `updateRecurrenceNextBilling` + tipo de resposta. |
| `src/pages/CustomerInvoiceNew.tsx` | Fluxos `invoice` / `renewal`, alerta, remoção do redirect. |
| `src/pages/CustomerInvoiceDetail.tsx` | Botões e rótulos distintos. |
| `docs/ETAPA_1_IMPLEMENTACAO_EDICAO_FATURAS_RECORRENTES.md` | Este documento. |
