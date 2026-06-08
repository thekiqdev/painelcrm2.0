# Sprint 1 — Bootstrap operacional do tenant

## Objetivo

Primeira experiência menos vazia após provisionamento acquisition, sem alterar onboarding/checkout/provisioning legado.

## Escopo implementado

| Item | Comportamento |
|------|----------------|
| **Equipe Principal** | `teams` slug `equipe-principal`; admin como `lead` em `team_members` |
| **Kanban Atendimento** | Board + colunas: Novo, Em atendimento, Aguardando retorno, Concluído |
| **Templates WhatsApp** | `ensureWhatsAppTemplateDefaults(tenantId)` no mesmo fluxo |

## Disparo

Somente em `provisionWorkspaceFromSession` (`acquisitionProvisioningService.ts`), após `COMMIT` do tenant/admin.

Falha no bootstrap **não** reverte o provisionamento (log `[acquisition] tenant_operational_bootstrap_failed`).

## Idempotência

- Equipe: busca por `slug` ou nome; `INSERT … ON CONFLICT DO NOTHING` no slug.
- Kanban: um board por nome `Atendimento` (não arquivado); colunas por nome no board.
- Templates: `seed_key` existente em `whatsapp_message_templates`.

## Fora de escopo (inalterado)

Funis, pipelines de vendas, campos personalizados, etiquetas globais, IA, dashboard/widgets, onboarding/checkout.

## Código

- `packages/backend/src/services/tenantOperationalBootstrapService.ts`
- Testes: `tenantOperationalBootstrapService.test.ts`
