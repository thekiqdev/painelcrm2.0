# Plano: Permissões e visibilidade por tenant

## Objetivo
Garantir que todos os usuários do **mesmo tenant (conta/empresa)** vejam e possam atuar nos dados conforme seu **tipo de acesso** (perfil), em vez de ver apenas o que eles mesmos criaram.

## Fluxo: middleware → tenantId → helpers/queries

1. **Autenticação:** `authenticateToken` define `req.userId` (e `req.user`) a partir do JWT.
2. **Tenant atual:** `setCurrentTenant` (após auth) chama `getTenantIdForUser(req.userId)` e define `req.tenantId`. Rotas tenant-scoped usam a cadeia `tenantAuth` = `[authenticateToken, setCurrentTenant, setRequestDb]`.
3. **Queries:** Em controllers, usar sempre `req.tenantId` (ou `req.userId`) para filtrar:
   - **Tabelas com `tenant_id`:** `WHERE tenant_id = $N` com `params[N-1] = req.tenantId`. Nunca aceitar `tenant_id` do body; usar `ensureTenantIdForInsert(req)` e `stripTenantIdFromBody(body)`.
   - **Tabelas com `user_id`:** usar os helpers de `utils/tenantScope.ts` (ex.: `joinUserTenant`, `joinUserTenantByUserId`, `whereUserInTenantFromUserId`) ou o padrão equivalente; em INSERT usar `ensureUserIdForInsert(req)` para `user_id`.
4. **RLS (Etapa 5):** O middleware `setRequestDb` define `SET LOCAL app.current_tenant_id` (e `app.bypass_rls` para superadmin) na conexão do request, de modo que as políticas RLS no banco aplicam uma segunda barreira de isolamento.

Referências: `docs/PLANO-ISOLAMENTO-MULTI-TENANT.md`, `docs/PADROES-TENANT-SCOPE.md`, `docs/RLS-ETAPA5.md`.

## Regra de implementação
- **Listar / Ver:** filtrar por tenant → registros cujo `user_id` (dono) está no mesmo `tenant_id` do usuário logado.
- **Criar:** manter `user_id = currentUser` (via `ensureUserIdForInsert(req)`); para tabelas com `tenant_id`, usar `ensureTenantIdForInsert(req)` e nunca ler do body.
- **Editar / Excluir:** (1) verificar que o registro pertence ao tenant (WHERE com condição de tenant); (2) `assertModulePermission` com `ownerId` (edit_own/delete_own) quando aplicável; (3) UPDATE/DELETE com condição de tenant (helpers `whereUserInTenantFromUserId` ou equivalente).

---

## Checklist por módulo (status e arquivos)

### ✅ Clientes (concluído)
| Arquivo | Funções | Status |
|---------|---------|--------|
| `clientsController.ts` | getClients, getClientById, updateClient, deleteClient, getClientTasks, createClientTask, updateClientTask, deleteClientTask | Escopo tenant aplicado |
| `clientGroupsController.ts` | getClientGroups, getClientGroupById, updateClientGroup, deleteClientGroup | Escopo tenant aplicado |

### ✅ Leads (concluído)
| Arquivo | Funções | Status |
|---------|---------|--------|
| `leadsController.ts` | getLeads, getLeadById, updateLead, deleteLead | Escopo tenant aplicado |
| `leadStatusesController.ts` | getLeadStatuses, updateLeadStatus, deleteLeadStatus | Escopo tenant aplicado |
| `leadTasksController.ts` | getLeadTasks, createLeadTask, updateLeadTask, deleteLeadTask | Lead no tenant; tarefas por lead |

### ✅ Funil de vendas (concluído)
| Arquivo | Funções | Status |
|---------|---------|--------|
| `funnelsController.ts` | getFunnels, getFunnelById, createFunnel, updateFunnel, deleteFunnel | Escopo tenant aplicado |
| `funnelStagesController.ts` | getStages, createStage, updateStage, deleteStage | Funil no tenant |

### ✅ Projetos (concluído)
| Arquivo | Funções | Status |
|---------|---------|--------|
| `projectsController.ts` | getProjects, getProjectById, createProject (client check), updateProject, deleteProject | Escopo tenant aplicado |
| `projectListsController.ts` | getProjectLists, createList, updateList, deleteList | Projeto no tenant |
| `projectAreasController.ts` | getProjectAreas, createArea, updateArea, deleteArea | Projeto no tenant |
| `projectTasksController.ts` | getTasksByList, getTasksByArea, createTask, updateTask, deleteTask | Lista/área/projeto no tenant |
| `projectTemplatesController.ts` | list/get/update/delete + stages/tasks | Escopo tenant aplicado |

### ✅ Tarefas gerais (módulo tasks) (concluído)
| Arquivo | Funções | Status |
|---------|---------|--------|
| `tasksController.ts` | getTasks, getTaskById, createTask, updateTask, deleteTask | Escopo tenant aplicado |

### Produtos
| Arquivo | Funções | Status |
|---------|---------|--------|
| `productsController.ts` | getProducts, getProductById, updateProduct, deleteProduct | Ajustar para tenant |

### Propostas, Contratos, Tickets, Financeiro
| Arquivo | Status |
|---------|--------|
| `proposalsController.ts` | Ajustar para tenant |
| `contractsController.ts` | Ajustar para tenant |
| `contractTemplatesController.ts` | Ajustar para tenant |
| `ticketsController.ts` | Ajustar para tenant |
| `ticketCategoriesController.ts` | Ajustar para tenant |
| `invoicesController.ts` | Ajustar para tenant |
| `expensesController.ts` | Ajustar para tenant |

### Dashboard e Busca
| Arquivo | Status |
|---------|--------|
| `dashboardController.ts` | Contagens e listas por tenant |
| `searchController.ts` | Resultados por tenant |

### Outros (message templates, chat)
| Arquivo | Status |
|---------|--------|
| `messageTemplatesController.ts` | Ajustar para tenant |
| `chatController.ts` | Lookups de clientes/leads por tenant |

---

## Padrão SQL usado

Usar os helpers de `utils/tenantScope.ts` (ver `docs/PADROES-TENANT-SCOPE.md`):

- **Listar (tabelas com user_id):**  
  `FROM entity e ${joinUserTenant('e', 'user_id', 1)}` com `params[0] = req.tenantId`.

- **Ver por ID / UPDATE / DELETE:**  
  `joinUserTenantByUserId`, `whereUserInTenantFromUserId` com `req.userId` para derivar o tenant.

- **Tabelas com tenant_id:**  
  `WHERE tenant_id = $N` com `req.tenantId`; em INSERT usar sempre `ensureTenantIdForInsert(req)`.

Helpers de tenant: `getTenantIdForUser(userId)` em `utils/tenant.ts`; helpers de escopo em `utils/tenantScope.ts`.
