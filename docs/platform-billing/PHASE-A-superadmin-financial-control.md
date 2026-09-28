# Fase A — Controle financeiro global (Super Admin)

## Objetivo

Área **Cobranças da plataforma** no Super Admin: listagem **somente leitura** de `tenant_billing` (SaaS), com filtros, detalhe e deep-links (ficha do tenant, link público da plataforma, fallback do gateway quando existir).

## Estado: concluído (implementação inicial)

## Endpoints (backend)

| Método | Caminho | Descrição |
|--------|---------|-----------|
| `GET` | `/api/superadmin/platform-billings` | Lista paginada (`limit`/`offset`, máx. 100). Query: `status`, `tenant_id`, `from`, `to` (datas de **criação**). |
| `GET` | `/api/superadmin/platform-billings/:id` | Detalhe de uma cobrança (mesmo DTO enriquecido da lista). |
| `POST` | `/api/superadmin/platform-billings/:id/public-link` | Garante `platform_public_pay_token` (idempotente) e devolve `platform_invoice_url`. |

Autenticação: middleware Super Admin existente (`superadminAuth`).

## Resposta agregada (campos principais)

- `id`, `tenant_id`, `tenant_name`, `plan_id`, `plan_name`
- `amount_cents`, `due_date`, `status`, `paid_at`
- `invoice_number`, `gateway`, `payment_method`, `gateway_reference_id`, `billing_reason`, `created_at`
- `has_public_pay_link`, `has_gateway_fallback_link`
- `platform_invoice_url` (derivado de `FRONTEND_URL` + token, quando o token é válido)
- `gateway_fallback_url` (extraído de forma controlada; **não** se devolve `gateway_metadata` completo)

## UI (frontend)

- Menu lateral Super Admin: **Cobranças da plataforma** → `/superadmin/platform-billings`
- Página `SuperAdminPlatformBillings.tsx`: filtros (status, UUID do tenant, período), tabela, diálogo de detalhe, botão para garantir link público, link para **Ficha** / faturamento: `/superadmin/clients/:tenantId/faturamento`

## Arquivos criados ou alterados (Fase A)

- `packages/backend/src/services/superadminPlatformBillingsService.ts`
- `packages/backend/src/controllers/superadminPlatformBillingsController.ts`
- `packages/backend/src/routes/superadminRoutes.ts`
- `src/pages/superadmin/SuperAdminPlatformBillings.tsx`
- `src/layouts/SuperAdminLayout.tsx` (item de menu)
- `src/App.tsx` (rota lazy)

## Migração de schema (dependência compartilhada com Fase B)

- `database/init/144_tenant_billing_platform_public_pay_token.sql` — coluna `platform_public_pay_token` + índice único parcial
- `packages/backend/src/migrate.ts` — inclusão do script `144`

## Validações realizadas

- `npm run build` em `packages/backend` (tsc) — sem erros
- `npm run build` na raiz (Vite) — sem erros
- Listagem não expõe `gateway_metadata` bruto; apenas URL de fallback quando aplicável

## Riscos / pontos de atenção

- Paginação usa `offset` (não `cursor`); suficiente para volume inicial; evoluir se a lista crescer muito
- Filtro de período aplica-se a `created_at`, não a `due_date`
- Sem ações destrutivas (cancelamento gateway, estorno) nesta fase
