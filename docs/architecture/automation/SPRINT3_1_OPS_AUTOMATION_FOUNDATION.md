# Sprint 3.1 — Ops Automation Foundation

## Objetivo

Desbloquear execução do motor de automações de coluna para **cards acquisition lead** no Kanban Operacional, sem side effects reais (mensagem/workflow).

## Entregas

| Fase | Implementação |
|------|----------------|
| Subject union | `KanbanAutomationSubject` em `kanbanAutomationContext.ts` |
| Resolver | `resolveKanbanAutomationContext()` |
| Phase2 foundation | `runKanbanPhase2AutomationsFoundation()` — logs only, no notify/webhook/message |
| Pipeline ops | `executeOpsLeadColumnAutomationFoundation()` após `patchCard` COMMIT |
| Timeline | `column_automation_started` / `_completed` / `_failed` |
| Logs | `[ops_kanban_column_automation]`, `[kanban_phase2_foundation]` |

## Comportamento

- **Tenant CRM (conversa):** inalterado — pipeline conversation-only preservado.
- **Ops lead-only:** ao mudar coluna, executa fundação + timeline; checkout abandonado hardcoded mantido.

## Fora de escopo (próximas sprints)

Mensagens reais, workflows configuráveis, templates, delays, jobs, multi-board.

## Arquivos

- `packages/backend/src/services/kanbanAutomationContext.ts`
- `packages/backend/src/services/kanbanOpsAutomationFoundation.ts`
- `packages/backend/src/services/kanbanColumnAutomationService.ts` (foundation branch)
- `packages/backend/src/controllers/chatKanbanController.ts` (integração patchCard)

## Teste manual

1. Mover card de lead no Kanban ops para coluna com `automation_config.enabled`.
2. Verificar `metadata.operational_timeline` do card.
3. Verificar logs no backend.
