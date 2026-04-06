# Etapa / Fase 11 — Operação, qualidade e testes de contrato

**Objetivo:** fechar o ciclo “código + produção” das fases **5–10** com documentação operacional única, critérios de aceite rastreáveis e **testes unitários mínimos** em lógica pura (sem DB).

## 1. Matriz de rollout (migrações obrigatórias)

| Ordem | Arquivo | Fase | Notas |
|-------|---------|------|--------|
| 1 | `80_customer_invoice_items_advanced_schedule.sql` | 5 | Colunas por item: `is_recurring`, `recurring_interval`, `scheduled_due_date` |
| 2 | `81_customer_invoice_parent_child_e2.sql` | 5 / E2 | `parent_invoice_id`, `parent_invoice_item_id`, `invoice_type` incl. `child`, índices |

Checklists detalhados: `PLANO-EVOLUCAO-FATURAS-PROXIMAS-FASES.md` §8 e §9.

## 2. Variáveis de ambiente (billing / público)

| Doc | Conteúdo |
|-----|----------|
| `docs/ENV-BILLING.md` | Worker, E2 (`BILLING_*`), telemetria pública (`PUBLIC_PAY_TELEMETRY_LOG`) |

## 3. Processos que devem existir em produção

| Processo | Script / comando |
|----------|-------------------|
| Enfileirar renovações | `billing:scheduler` → `runRecurringScheduler.ts` |
| Processar jobs + filas E2 | `billing:worker` → `runRecurringWorker.ts` (`processChildItemDueInvoices` + `processNextBatch`) |

## 4. Critérios de aceite (resumo)

| Área | Aceite mínimo |
|------|-----------------|
| Recorrência customer | Job cria fatura `recurring` ou avança ciclo; sem duplicar `(subscription_id, period_start)` para fatura de ciclo |
| E2 filha | Uma filha por `(parent_invoice_item_id, due_date)`; flag `BILLING_CHILD_ITEM_INVOICES_ENABLED=false` desliga geração |
| Página `/pay/:token` | GET retorna `has_payment_payload` / `payment_options_summary`; UI reage a payload ausente |
| Gateway | Webhook continua atualizando status; polling público não substitui webhook |

## 5. Testes automatizados (Fase 11)

- **Unitário:** `packages/backend/src/services/publicPayPayloadMeta.test.ts` — contrato estável do payload público (Fase 10).
- **Evolução sugerida:** E2E Playwright/Cypress para `/pay/:token`; testes de carga no worker (H4).

## 6. Backlog pós–Fase 11 (não escopo desta etapa)

- **G3** — múltiplas opções de gateway/método na mesma fatura (decisão de produto).
- **C2** — múltiplos métodos por cobrança (depende de API do gateway).
- **D4** — recorrência diária da **fatura inteira** (hoje só por item).
- **B3** — padronizar `ClientSearchCombobox` em todo o produto.
- **D2** — vínculo opcional `customer_charges` × recorrência.

## 7. Referências cruzadas

- `docs/FASE9-RECORRENCIA-POR-ITEM.md`
- `docs/FASE10-PAGAMENTO-PUBLICO-AVANCADO.md`
- `docs/PLANO-TECNICO-EVOLUCAO-AREA-FATURAS.md` §9
