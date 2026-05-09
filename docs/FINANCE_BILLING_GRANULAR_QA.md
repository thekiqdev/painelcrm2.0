# Fase 4 — QA: Financeiro, Faturamento, Dashboard (granular)

## Limitação `billing.view_own` / `billing.view_all`

- A tabela `customer_invoices` **não possui** `created_by` / `user_id` do autor no modelo atual.
- A flag `billing_view_own_only` em `module_extras` é interpretada no catálogo (`billing.view_all` / `billing.view_own`), mas **não há filtro “só minhas faturas”** nas listagens até existir coluna confiável no banco. As APIs de listagem continuam por tenant; a negação fina depende de `billing.view_invoices` e chaves irmãs.

## Logs `PERMISSION_DEBUG=1`

- `assertPermissionKey` e o engine de permissões emitem linhas `[permission-check]` com `key`, `route`, `allowed`, `source`.

## Perfis de teste sugeridos (API + UI)

| Perfil | Configuração (resumo) | Esperado |
|--------|------------------------|----------|
| A | `finance` e `billing` sem `can_view` (ou módulos desligados) | Sem cards financeiros no dashboard; rotas `/customer-invoices`, `/finance/relatorios` redirecionam ou 403 na API. |
| B | Só `billing` com `can_view` + extras padrão | Faturas/cobranças/assinaturas; sem despesas/contas a pagar/relatórios financeiros se `finance` negado. |
| C | Só `finance` com `can_view` + extras | Despesas, contas a pagar, relatórios; sem criar fatura se `billing.create_invoice` falso. |
| D | Financeiro + faturamento completos (extras `true`) | Paridade com admin funcional nas chaves concedidas. |
| Admin | Tenant admin | Ignora negações granulares (`hasPermissionKey` / `assertPermissionKey`). |

## Arquivos principais

- Catálogo: `packages/backend/src/permissions/permissionCatalog.ts`, espelho `src/permissions/permissionCatalog.ts`.
- Gates do dashboard: `packages/backend/src/services/dashboardOverviewGates.ts`.
- Guard de rotas: `src/components/RequireModuleView.tsx`.
- Menu: `src/layouts/AppLayout.tsx`; dashboard: `src/pages/Dashboard.tsx`.
