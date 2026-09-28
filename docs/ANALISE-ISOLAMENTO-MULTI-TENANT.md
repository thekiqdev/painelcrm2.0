# Análise: isolamento multi-tenant (banco e autenticação)

Documento de análise pré-implementação do plano de isolamento multi-tenant. Objetivo: confirmar o estado atual em quatro frentes.

---

## 1) Todos os usuários possuem `tenant_id`?

### Schema

- Em `database/init/26_tenants_and_user_tenant.sql`, a coluna em `users` é:
  - `tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL`
- Ou seja: **`tenant_id` é opcional (nullable)**.

### Migração 32

- `database/init/32_migrate_old_users_to_tenants.sql` cria um tenant para cada usuário que:
  - tem `user_profile` (é owner de perfil/empresa),
  - tem `tenant_id IS NULL`,
  - e **não** é super admin (`is_super_admin IS FALSE OR is_super_admin IS NULL`).
- Apenas esses usuários recebem `tenant_id` preenchido.

### Conclusão 1

**Não.** Nem todos os usuários têm `tenant_id`:

- **Super admins** podem ter `tenant_id` NULL (não passam pela migração 32).
- Usuários **sem user_profile** (ex.: convidados ou contas antigas sem perfil) podem continuar com `tenant_id` NULL.
- Usuários criados **após** a migração: depende do fluxo de registro; em `authController` o registro pode atribuir `tenant_id` ao criar o tenant.

**Recomendação:** Rotas que exigem tenant devem checar `req.tenantId` e retornar 403 quando for null. O middleware `setCurrentTenant` (plano) deve preencher `req.tenantId` a partir de `getTenantIdForUser(req.userId)`; usuários sem tenant terão `req.tenantId === null`.

### Verificação no banco (executar manualmente)

```sql
-- Usuários sem tenant_id (esperado: super admins e eventualmente usuários sem perfil)
SELECT id, email, tenant_id, is_super_admin
FROM users
WHERE tenant_id IS NULL
ORDER BY created_at DESC;
```

---

## 2) Registros sem tenant em tabelas que deveriam ser tenant-scoped

### Definição

- **Tabelas com `tenant_id`:** linhas com `tenant_id` NULL (exceto onde o schema permite, ex.: `project_templates`).
- **Tabelas só com `user_id`:** “sem tenant” = `user_id` apontando para usuário com `tenant_id` NULL. Esses registros não pertencem a nenhum tenant e não devem aparecer em listagens por tenant.

### Tabelas com coluna `tenant_id`

| Tabela                    | tenant_id   | Observação                                      |
|---------------------------|------------|--------------------------------------------------|
| `users`                   | nullable   | Ver item 1.                                      |
| `teams`                   | NOT NULL   | Não deveria haver linha com tenant_id NULL.      |
| `tenant_plan`             | NOT NULL   | Idem.                                            |
| `tenant_billing`          | NOT NULL   | Idem.                                            |
| `tenant_feature_overrides`| NOT NULL   | Idem.                                            |
| `tenant_admin_notes`      | NOT NULL   | Idem.                                            |
| `tenant_tags`             | NOT NULL   | Idem.                                            |
| `project_templates`        | NULLABLE   | NULL = template do sistema (correto).            |

### Tabelas apenas com `user_id` (escopo indireto por tenant)

São tenant-scoped via “dono (user_id) pertence ao tenant”: clients, leads, lead_statuses, lead_tasks, client_groups, client_tasks, sales_funnels, funnel_stages, products, proposals, contracts, contract_templates, invoices, expenses, tickets, ticket_categories, message_templates, projects, project_lists, project_tasks, tasks, notifications, chat_instances, chat_conversations, etc. Para essas, “registro sem tenant” = `user_id` em usuário com `tenant_id` NULL.

### Queries de verificação (executar no banco)

```sql
-- 2.1) Tabelas com tenant_id NOT NULL: alguma linha com tenant_id NULL? (não deveria)
SELECT 'teams' AS tbl, COUNT(*) AS n FROM teams WHERE tenant_id IS NULL
UNION ALL SELECT 'tenant_plan', COUNT(*) FROM tenant_plan WHERE tenant_id IS NULL
UNION ALL SELECT 'tenant_billing', COUNT(*) FROM tenant_billing WHERE tenant_id IS NULL
UNION ALL SELECT 'tenant_feature_overrides', COUNT(*) FROM tenant_feature_overrides WHERE tenant_id IS NULL
UNION ALL SELECT 'tenant_admin_notes', COUNT(*) FROM tenant_admin_notes WHERE tenant_id IS NULL
UNION ALL SELECT 'tenant_tags', COUNT(*) FROM tenant_tags WHERE tenant_id IS NULL;

-- 2.2) Registros em tabelas user_id cujo dono não tem tenant (órfãos de tenant)
SELECT 'clients' AS tbl, COUNT(*) AS n
FROM clients c
JOIN users u ON u.id = c.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'leads', COUNT(*) FROM leads l JOIN users u ON u.id = l.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'products', COUNT(*) FROM products p JOIN users u ON u.id = p.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'contracts', COUNT(*) FROM contracts c JOIN users u ON u.id = c.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'invoices', COUNT(*) FROM invoices i JOIN users u ON u.id = i.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'expenses', COUNT(*) FROM expenses e JOIN users u ON u.id = e.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'proposals', COUNT(*) FROM proposals p JOIN users u ON u.id = p.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'tickets', COUNT(*) FROM tickets t JOIN users u ON u.id = t.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'projects', COUNT(*) FROM projects p JOIN users u ON u.id = p.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'tasks', COUNT(*) FROM tasks t JOIN users u ON u.id = t.user_id AND u.tenant_id IS NULL
UNION ALL
SELECT 'message_templates', COUNT(*) FROM message_templates m JOIN users u ON u.id = m.user_id AND u.tenant_id IS NULL;
```

Se alguma contagem for > 0, há registros “sem tenant” (órfãos ou inconsistência). Ação: decidir se migram para um tenant ou ficam excluídos do escopo tenant.

---

## 3) Endpoints que retornam dados sem filtro por tenant

Critério: endpoint que lista ou retorna por ID dados de negócio e usa **apenas** `user_id = req.userId` (só “meus” registros), em vez de “todos do meu tenant”.

### Já com filtro por tenant (OK)

| Controller                    | Observação |
|------------------------------|------------|
| `clientsController`          | JOIN/WHERE por tenant (getTenantIdForUser + tenant scope). |
| `clientGroupsController`      | Idem. |
| `leadsController`             | Idem. |
| `leadStatusesController`      | Idem. |
| `leadTasksController`         | Idem. |
| `funnelsController`           | Idem. |
| `funnelStagesController`      | Idem. |
| `projectsController`          | Idem. + regras de responsible_ids/team_ids. |
| `projectListsController`      | Projeto no tenant. |
| `projectAreasController`     | Idem. |
| `projectTasksController`      | Lista/área/projeto no tenant. |
| `projectTemplatesController`  | Escopo tenant (user_id no tenant + templates sistema). |
| `tasksController`            | Escopo tenant. |
| `teamsController`             | Filtra por `tenant_id` (tabela tem tenant_id). |
| `tenantsController`           | Superadmin ou por tenant_id. |
| `myTenantPlanController`      | Sempre por tenant do usuário. |
| `authController` (getMe etc.)| Usuário atual; tenant quando necessário. |

### Sem filtro por tenant (só `user_id = req.userId`) — correção necessária

| Controller                   | Métodos afetados (ex.) | Risco |
|-----------------------------|------------------------|--------|
| `productsController`       | getProducts, getProductById, updateProduct, deleteProduct | Lista/ver/editar só “meus”; outros usuários do tenant não veem. |
| `proposalsController`       | getProposals, getProposalById, update, delete | Idem. |
| `contractsController`       | getContracts, getContractById, update, delete | Idem. |
| `contractTemplatesController`| getContractTemplates, getById, update, delete | Idem. |
| `invoicesController`        | getInvoices, getInvoiceById, update, delete | Idem. |
| `expensesController`       | getExpenses, getExpenseById, update, delete | Idem. |
| `ticketsController`        | getTickets, getTicketById, update, delete | Idem. |
| `ticketCategoriesController`| getTicketCategories, getById, update, delete | Idem. |
| `messageTemplatesController`| getMessageTemplates, getById, update, delete | Idem. |
| `dashboardController`      | getKPIs, getRecentLeads, getRecentContracts, etc. | KPIs e listas só do usuário, não do tenant. |
| `searchController`         | searchGlobal (clients, leads, contracts, products) | Busca só “meus” registros. |

### Por design (não exigem escopo tenant na listagem)

| Controller               | Motivo |
|--------------------------|--------|
| `notificationsController`| Notificações são por usuário (user_id); cada um vê só as suas. |
| `profileController`      | Dados do usuário logado. |
| `registrationStepsController` | Passos do usuário. |

### Rotas globais (superadmin / sistema)

- `exportController`, `reportsController`, `plansController`, `systemFeaturesController`, etc., quando usados em rotas `/api/superadmin/*`: dados globais; não aplicam filtro tenant.

**Resumo 3:** Os controllers da tabela “Sem filtro por tenant” devem passar a usar escopo por tenant (via `req.tenantId` ou `getTenantIdForUser` + condição “user_id IN (usuários do tenant)” ou equivalente).

---

## 4) Tabelas que deveriam ter `tenant_id` mas não possuem

Hoje o modelo é misto:

- **Com `tenant_id`:** `users`, `teams`, `tenant_*`, `project_templates` (nullable).
- **Só com `user_id`:** a maioria das tabelas de negócio (clients, leads, products, contracts, etc.). O isolamento é feito por “user_id IN (SELECT id FROM users WHERE tenant_id = $1)”.

### Vantagem de não ter `tenant_id` em todas

- Menos duplicação: uma única coluna de “dono” (`user_id`).
- Migração 32 e fluxo de registro já vinculam usuário ao tenant; o escopo é derivado.

### Desvantagem

- Queries sempre precisam do JOIN/subquery com `users`; índice em `(tenant_id, ...)` nas tabelas de negócio poderia ajudar em performance e deixar o modelo mais explícito.

### Conclusão 4

**Não é obrigatório** que todas as tabelas tenant-scoped tenham `tenant_id`; o modelo atual (escopo por `user_id` no tenant) é válido. Porém:

- **Tabelas que já têm `tenant_id`:** devem manter e garantir que nenhuma linha fique com tenant_id NULL (exceto onde o schema permite).
- **Tabelas só com `user_id`:** podem continuar assim; o importante é que **todos os endpoints** usem o filtro por tenant (via `user_id IN (users do tenant)` ou middleware/repositório que injete isso).
- **Opcional (evolução):** adicionar `tenant_id` em tabelas muito grandes ou muito consultadas (ex.: `clients`, `leads`, `contracts`) para índices e RLS; isso seria uma mudança de schema planejada, não pré-requisito do plano atual.

**Tabelas que são claramente por tenant e hoje só têm `user_id` (candidatas futuras a `tenant_id` se quiser normalizar):**

- clients, client_groups, client_tasks  
- leads, lead_statuses, lead_tasks  
- sales_funnels, funnel_stages  
- products, proposals, contracts, contract_templates, contract_signers, contract_events  
- invoices, expenses  
- tickets, ticket_categories, ticket_messages, ticket_templates, etc.  
- message_templates, message_logs  
- projects, project_lists, project_tasks  
- tasks  
- notifications  
- chat_instances, chat_conversations  
- evolution_api_configs, evolution_servers, whatsapp_connections, etc.  

Nenhuma delas “deveria ter e não tem” de forma obrigatória; a obrigação é **aplicar o filtro por tenant em todas as queries e endpoints** que as utilizam.

---

## Resumo executivo

| Pergunta | Resposta |
|----------|----------|
| 1) Todos os usuários têm `tenant_id`? | **Não.** Nullable no schema; super admins e usuários sem perfil podem ter NULL. |
| 2) Existem registros sem tenant em tabelas tenant-scoped? | Verificar com os SQLs da seção 2; possível em tabelas `user_id` se existirem usuários com `tenant_id` NULL com dados. |
| 3) Endpoints sem filtro por tenant? | **Sim.** Produtos, propostas, contratos, templates de contrato, invoices, expenses, tickets, categorias de ticket, message templates, dashboard e busca global usam só `user_id = req.userId`. |
| 4) Tabelas que deveriam ter `tenant_id` e não têm? | **Não é obrigatório** ter; o modelo com `user_id` + “usuário no tenant” é válido. Adicionar `tenant_id` é evolução opcional para performance/RLS. |

**Próximo passo:** Executar os SQLs de verificação (seção 1 e 2) no ambiente; em seguida implementar o plano em `docs/PLANO-ISOLAMENTO-MULTI-TENANT.md`, começando pelo middleware `setCurrentTenant` e pela correção dos endpoints listados na seção 3.
