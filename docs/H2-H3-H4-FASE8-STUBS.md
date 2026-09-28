# H2, H3, H4 — Fase 8 (documentação consolidada)

Substitui o conteúdo mínimo anterior (“stub”) por texto operacional para **PCI**, **webhook × UI** e **worker × recorrência**, sem antecipar implementações da Fase 9.

---

## H2 — PCI / cartão na aplicação

| Decisão | Detalhe |
|---------|---------|
| **Vigente** | Não capturar PAN/CVV na app; usar **redirect ou checkout hospedado** do gateway. |
| **Responsabilidade** | Dados sensíveis ficam no domínio do provedor (SAQ reduzido para o PainelCRM enquanto mantiver esse modelo). |
| **Se evoluir** | Tokenização, 3DS e escopo PCI passam a ser **por gateway**; exigir revisão jurídica/DPO antes de campos de cartão internos. |

**Matriz de risco (alto nível)**

| Cenário | PCI / compliance |
|---------|------------------|
| Apenas links + PIX copia/cola na nossa UI | Baixo — sem captura de cartão |
| iframe / hosted fields do gateway | Médio — depende do contrato do provedor |
| Campos de cartão no React do PainelCRM | Alto — fora do escopo atual |

---

## H3 — Webhook × pagamento “na tela”

| Etapa | Responsável |
|-------|-------------|
| Estado “pago” persistido | **Webhook** → serviços de billing |
| Feedback imediato ao usuário | **Polling** do `GET` público (ou redirect de retorno, se existir) |
| Idempotência | Handlers de webhook devem tolerar reenvio de eventos |

**Fluxo webhook (checklist de testes sugeridos)**

1. Fatura em status pagável; abrir `/pay/:token`.
2. Simular ou executar pagamento no sandbox do gateway.
3. Confirmar recebimento do webhook (logs / fila).
4. Confirmar `customer_invoices.status` atualizado no banco.
5. Confirmar que a UI pública passa a exibir “Pago” (polling ou próximo refresh).

**Regra explícita:** melhorias **somente de UI** (polling, mensagens, PIX inline) **não** substituem o pipeline de webhook; não alterar fluxo de pagamento atual sem migração de contrato documentada.

---

## H4 — Worker × recorrência por item

| Componente | Papel |
|------------|--------|
| `subscriptions` (tipo customer) + jobs de renovação | Ciclo de assinatura / faturas periódicas |
| `recurringBillingJobService` | Renovação por ciclo |
| `processChildItemDueInvoices` (E2) | Itens com `scheduled_due_date` fora do ciclo principal |
| `getCustomerInvoiceSchema` + migração 80 | Colunas opcionais em `customer_invoice_items`; sem migração, comportamento degradado (ver `docs/FASE8-ROLLOUT-MIGRACOES-80-81.md`) |

**Impacto recorrência**

- Webhook que marca uma fatura como paga **não** cria automaticamente a próxima — isso é responsabilidade dos **workers** / regras de assinatura.
- Alteração em `calculateNextItemDueDate`, idempotência de criação de fatura ou flags `is_recurring` exige **testes de regressão** nos jobs (staging com CRON ou execução manual).

**Risco futuro:** duplicar regras entre serviços — manter uma fonte de verdade para “próxima data” e documentar em `docs/FASE9-RECORRENCIA-POR-ITEM.md` + `docs/ENV-BILLING.md` quando evoluir.

---

## Referências

- `docs/PLANO-TECNICO-EVOLUCAO-AREA-FATURAS.md` §7.1
- `docs/H1-FASE6-PAGAMENTO-PUBLICO.md`
- `docs/FASE8-ROLLOUT-MIGRACOES-80-81.md`
- `packages/backend/src/services/customerInvoiceSchema.ts`
