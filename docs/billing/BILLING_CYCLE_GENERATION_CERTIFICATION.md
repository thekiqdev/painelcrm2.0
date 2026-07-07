# Certificação — Geração Determinística por Ciclo (Sprint 4.2D)

**Data:** 2026-06-25  
**Escopo:** Runtime manual (`POST manual-renew`) — sem alteração em billing engine, worker, scheduler ou gateway.

## Critérios de aceite

| # | Cenário | Status |
|---|---------|--------|
| 1 | Competência de Julho sem invoice → clicar Julho gera Julho | ✓ `cycle_id` no request |
| 2 | Agosto já existe → Julho ainda gera Julho | ✓ job usa `cycle.cycle_date` |
| 3 | Após gerar Julho, Agosto inalterado | ✓ sem recálculo pré-geração |
| 4 | Próxima prévia promovida após avanço pós-sucesso | ✓ pipeline existente |
| 5 | Sem invoices duplicadas | ✓ validação `invoice_id IS NULL` |
| 6 | Sem ciclos pulados no clique explícito | ✓ lookup por id |
| 7 | Histórico, Calendário, Sidebar sincronizados | ✓ mesmo `cycleId` na UI |

## Casos de borda cobertos

- Competência pulada (`status = skipped`, sem invoice)
- Recuperação legada (`status = cancelled`, sem invoice)
- Múltiplas competências sem invoice (fallback: mais antiga)
- Geração fora de ordem (`cycle_id` explícito)
- Ciclo inexistente → `cycle_not_found`
- Ciclo já faturado → `cycle_not_generatable`
- Sem ciclos na tabela → `cycle_required`

## Testes automatizados

```
packages/backend/src/services/billingCycleInvoiceGenerationService.test.ts
packages/backend/src/services/billingManualRenewalExecution.test.ts
src/lib/subscriptionBillingGeneration.test.ts
```

## Definition of Done

- [x] Botões de geração enviam `cycle_id` quando disponível
- [x] Backend não usa `next_billing_date` para escolher competência manual
- [x] `generateInvoiceForCycle` implementado
- [x] Sem mudanças em billing engine / worker / scheduler
- [x] Documentação de arquitetura e certificação
- [x] Suite de testes do serviço de ciclo verde

## Artefato

Relatório estático — validação de produção via `npm run billing:production-validation` permanece inalterada (sem regressão 4.2A–4.2C).
