# Sprint 5.0-24D — UX de Alerta + Certificação

**Data:** 2026-07-07  
**Depende de:** Sprint 5.0-24C (lifecycle + repair API)

## Objetivo

Visibilidade explícita para o operador quando INV-19 está violado (`invoiced` + `invoice_id = NULL`), com ação manual **Corrigir** além do repair silencioso do 24C.

## Entregas

| Superfície | Comportamento |
|------------|---------------|
| **Histórico** | Botão âmbar ⚠️ **Corrigir** quando `needsInvariantRepair` |
| **Calendário** | Ícone ⚠️ no dia + popover com mensagem e **Corrigir** |
| **`resolvedCompetencyPresentation`** | `cycleNeedsInvariantRepair()` + flag em `ResolvedCompetencyPresentation` |
| **`historyAdapter` / `calendarAdapter`** | Propagam `needsInvariantRepair`; bloqueiam Gerar até repair |
| **`crmSubscriptionsService.repairCycleInvariants`** | POST `repair-cycle-invariants` |
| **`SubscriptionDetail`** | `handleRepairCycleInvariant` + refresh |

## Regras UX

1. `needsInvariantRepair` ⇔ `status === 'invoiced'` && `!invoiceId`
2. Enquanto repair pendente: **não** mostrar Gerar (evita `cycle_not_generatable` confuso)
3. Após **Corrigir** ou GET com auto-repair 24C: alerta some, **Gerar** aparece
4. Permissão: `billing.edit_subscription`

## Cenários de certificação

| # | Cenário | Esperado |
|---|---------|----------|
| A | Ciclo zombie no histórico | ⚠️ + Corrigir visível; sem Gerar |
| B | Clique Corrigir | Toast sucesso; refresh; Gerar aparece |
| C | GET já reparou (24C) | Sem alerta; Gerar direto |
| D | Calendário — dia com zombie | ⚠️ no número do dia |
| E | Popover calendário | Mensagem + Corrigir |
| F | Sem permissão edit | Botão desabilitado |

## Testes automatizados

- `subscriptionBillingVisibility.test.ts` — `cycleNeedsInvariantRepair`, history row flags
- Backend 24C — lifecycle + repair endpoint (inalterado nesta sprint)

## Auto-reparo vs manual

| Camada | Quando |
|--------|--------|
| **Silencioso (24C)** | GET assinatura, manual-renew |
| **Manual (24D)** | Operador vê alerta e clica Corrigir |

Ambos chamam o mesmo endpoint/backend `repairInvoicedCyclesWithoutInvoice`.
