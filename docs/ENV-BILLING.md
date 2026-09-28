# Variáveis de ambiente — Billing / recorrência

| Variável | Obrigatório | Default | Descrição |
|----------|-------------|---------|-----------|
| `RECURRING_WORKER_ID` | Não | `worker-<pid>` | Identificador no lock de jobs (`billing_recurring_jobs`). |
| `BILLING_CHILD_ITEM_INVOICES_ENABLED` | Não | *(ligado)* | `false` desliga geração de **faturas filhas** (E2) em `processChildItemDueInvoices`. |
| `BILLING_CHILD_BATCH_LIMIT` | Não | `50` | Quantidade máxima de itens candidatos por execução (1–200). |
| `PUBLIC_PAY_TELEMETRY_LOG` | Não | *(desligado)* | Se `true`, logs estruturados `[BILLING]` em `GET`/`POST` públicos de pagamento (sem token/invoice id). Ver `docs/FASE10-PAGAMENTO-PUBLICO-AVANCADO.md`. |

**Produção:** em incidente de duplicidade ou gateway, pode-se definir temporariamente `BILLING_CHILD_ITEM_INVOICES_ENABLED=false` e reiniciar o processo do worker (sem alterar código).

Documentação de regras: `docs/FASE9-RECORRENCIA-POR-ITEM.md`.
