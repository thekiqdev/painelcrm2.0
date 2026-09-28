# Bloco visual de recorrência na fatura (CRM)

**Objetivo:** na tela de detalhe da fatura do cliente, mostrar estado da recorrência sem depender de logs nem do Super Admin.

**Data:** 2026-04-22.

---

## Onde foi implementado

| Camada | Local |
|--------|--------|
| Frontend | `src/pages/CustomerInvoiceDetail.tsx` — último bloco dentro do `CardContent`, **depois** dos itens da fatura (rodapé do card). |
| Componente | `src/components/invoices/InvoiceRecurrenceBlock.tsx` — card **Recorrência**, badge de status, campos legíveis, opcional operacional. |
| API | `GET /api/customer-invoices/:id/recurrence-insight` — autenticação tenant (mesmo middleware das outras rotas CRM). |
| Backend | `packages/backend/src/services/customerInvoiceRecurrenceInsightService.ts` — monta o payload a partir de `customer_invoices`, `subscriptions`, `billing_recurring_jobs`. |

---

## Dados utilizados

- **Fatura atual:** `subscription_id` (se ausente → bloco não é exibido).
- **Assinatura:** `subscriptions` filtrado por `id` + `tenant_id`.
- **Jobs:** último registro em `billing_recurring_jobs` por `updated_at DESC`; contagem de jobs `pending`/`processing`; colunas `completion_*` quando a migração 130 existe (via `billingRecurringJobsHasCompletionColumns`).

Não duplica execução do worker; apenas **lê** o estado já persistido.

---

## Mapeamento dos estados visuais (`visual_tag` → badge PT)

Prioridade aplicada **no backend** (ordem):

1. **Cancelada** (`cancelled`): assinatura não encontrada; ou `subscriptions.status !== 'active'`; ou `cancel_at_period_end` com `current_period_end` já passado.
2. **Falhou** (`failed`): último job com `status = failed`.
3. **Agendada** (`scheduled`): último job `pending` ou `processing`; OU nenhum job ainda; OU último `completed` sem `result_invoice_id` e sem outcome de “sem invoice” (ambiguidade tratada como “ver operação”).
4. **Sem nova fatura** (`no_new_invoice`): último job `completed` com `completion_outcome = completed_no_invoice_no_eligible_items` **ou** detalhe JSON com `reason: no_eligible_recurring_items_for_cycle`.
5. **Processada** (`processed`): último job `completed` com `result_invoice_id` preenchido.

**Badge textual** (`status_badge_pt`): “Cancelada”, “Falhou”, “Agendada”, “Sem nova fatura”, “Processada”.

**Utilizador comum** vê texto resumido (`last_result_summary_pt`, `problem_hint_pt`).  
**Operador** (`is_tenant_admin` **ou** `can_manage_plan` **ou** `is_super_admin`): secção recolhível **Detalhes operacionais** com `completion_outcome`, IDs, JSON parseado de `completion_detail` (sem JSON cru para o utilizador sem esse papel).

---

## Campos mostrados no card

| Campo | Origem |
|-------|--------|
| Próxima cobrança prevista | `subscriptions.next_billing_date` |
| Periodicidade | `billing_interval` → label PT (Mensal, Trimestral, …) |
| Último processamento | `updated_at` do último job |
| Último resultado | Texto derivado do `visual_tag` / job |
| Atenção / problema | `problem_hint_pt` (ex.: mensagem amigável para “sem itens elegíveis”) |
| Fila | Contagem + linha quando há job pendente/processando |
| Abrir última fatura gerada | Link interno se `last_generated_invoice_id` ≠ fatura atual |

---

## Próxima data e último resultado

- **Próxima data:** sempre que a assinatura existir, usa-se `next_billing_date` da subscription (formato legível em PT-BR).
- **Último resultado:** baseado no **último job** por `updated_at`; se não houver jobs, mensagem explícita sobre scheduler/worker.

---

## Riscos remanescentes

- Estados derivados de **um único último job** — múltiplos jobs errados no histórico podem ser ofuscados se um job mais recente tiver outro estado.
- Migração 130 ausente: `completion_outcome` pode ser `null` — deteção de “sem nova fatura” depende mais do JSON em `completion_detail` quando disponível.
- **Super Admin** autenticado no tenant CRM vê detalhes operacionais; utilizador sem papel de admin vê só o resumo.

---

## Checklist de aceite

- [x] Fatura com `subscription_id` mostra o bloco **Recorrência**.
- [x] Status visual (badge) claro.
- [x] Próxima data e periodicidade visíveis quando a assinatura existe.
- [x] Último processamento / último resultado visíveis.
- [x] Caso “sem nova fatura” e falha distinguíveis.
- [x] Fatura sem recorrência não mostra o bloco (UI limpa).
- [x] Layout em card alinhado ao restante da página.
