# Etapa 2 — Leitura de `subscription_cycles` no insight de recorrência

Referência: [PLANO_DEFINITIVO_FATURAS_RECORRENTES_COM_CICLOS.md](./PLANO_DEFINITIVO_FATURAS_RECORRENTES_COM_CICLOS.md), [SUBSCRIPTION_CYCLES_PHASE1.md](./SUBSCRIPTION_CYCLES_PHASE1.md).

## Objetivo

Usar `subscription_cycles` **apenas como leitura** no `GET /api/customer-invoices/:id/recurrence-insight`, com **fallback legado** (jobs + assinatura) quando a flag global estiver desligada ou quando não houver ciclo correspondente à fatura.

## Flag

- Chave: `subscription_cycles_read` em `superadmin_settings`.
- Valores: `'true'` | `'false'` (texto). **Default em novas migrações:** `true` (141 + 143). Se a linha não existir ou o valor estiver vazio, o runtime trata como **ligado**; se a tabela `superadmin_settings` não existir (sem migrações), o backend assume **desligado** por segurança.
- **Controlo operacional:** Super Admin → **Configurações → Ciclos de assinatura** — interruptor *Usar ciclos de assinatura na leitura/insight* (API `GET/PUT /api/superadmin/billing/subscription-cycles-flags`). SQL direto só para diagnóstico pontual, não como procedimento padrão.

## Comportamento

| Flag / estado | Comportamento |
|------|----------------|
| `false` **explícito** | Igual à Etapa 0: insight só a partir de `subscriptions` + `billing_recurring_jobs`. Campo `subscription_cycles_insight` **omitido** na resposta JSON. |
| `true`, linha ausente ou valor vazio | Resposta inclui `subscription_cycles_insight` com `matched_cycle` (se existir) e `recent_cycles` (até 24 linhas). Se existir ciclo correspondente à fatura, **badge**, **resumo** e **timestamps** principais são derivados do ciclo, com exceções abaixo. |
| Tabela `superadmin_settings` inexistente | Tratado como desligado (sem crash). |

### Correspondência fatura ↔ ciclo

1. `subscription_cycles.invoice_id = :invoiceId`, ou
2. `cycle_date = customer_invoices.period_start` (YYYY-MM-DD).

### Prioridade (segurança operacional)

- Não sobrepõe o estado **`stale_after_reschedule`** (job cancelado por mismatch de ciclo).
- **Último job `failed`** continua a forçar visual “Falhou”.
- **Último job `pending` / `processing`** continua a mostrar fila em curso (alinhado ao worker).

### O que **não** muda nesta etapa

- Scheduler, worker, geração de faturas e avanço de `next_billing_date` — **inalterados**.
- `renewal_enqueue_status`, contagens de jobs pendentes e bloco operacional (job/outcome) — mantidos para operadores.

## Ficheiros

| Ficheiro | Função |
|----------|--------|
| `packages/backend/src/services/subscriptionCyclesReadFlagService.ts` | Lê `subscription_cycles_read` |
| `packages/backend/src/services/subscriptionCyclesSuperadminSettingsService.ts` | Painel Super Admin (persistência) |
| `packages/backend/src/services/subscriptionCyclesQueryService.ts` | Lista ciclos / encontra ciclo da fatura |
| `packages/backend/src/services/subscriptionCyclesInsightPresentation.ts` | Rótulos PT e mapeamento ciclo → badge/resumo |
| `packages/backend/src/services/recurrenceInsightVisualTag.ts` | Tipo partilhado `RecurrenceVisualTag` |
| `packages/backend/src/services/customerInvoiceRecurrenceInsightService.ts` | Integração + payload `subscription_cycles_insight` |
| `src/services/customerInvoices.ts` | Tipo TS do frontend |
| `src/components/invoices/InvoiceRecurrenceBlock.tsx` | Secção colapsável “Ciclos da assinatura” |

## Critérios de aceite (checklist)

- [x] Flag `false` explícita: comportamento idêntico ao anterior (sem chave extra na API).
- [x] Flag `true`: tabela de ciclos visível e ciclo da fatura destacado quando há dados.
- [x] Fallback: sem ciclo correspondente, mantém apresentação legada.
- [x] Nenhuma alteração ao motor recorrente (scheduler/worker).

## Próxima etapa

- **Etapa 3 (implementada):** dual-write — ver [SUBSCRIPTION_CYCLES_PHASE3.md](./SUBSCRIPTION_CYCLES_PHASE3.md).
