# Auditoria técnica — Permissões por módulo e perfis operacionais

**Data:** 2026-05-08  
**Escopo:** mapear o modelo atual (BD, API, frontend), lacunas de segurança/UX, matriz granular proposta, plano de migração em fases.  
**Instrução:** não implementar refatoração neste documento — apenas relatório e plano.

---

## 1. Modelo atual de permissões

### 1.1 Conceito geral

- Cada **usuário** pertence a um **tenant** e a um **perfil** (`user_profiles`).
- Permissões efetivas vêm de:
  1. **Perfil customizado** (`user_custom_roles` → `custom_role_module_permissions`), se atribuído; ou
  2. **Role de sistema** (`user_roles` → `role_module_permissions`): `admin`, `manager`, `member`, `viewer`.
- **Admin de tenant** (`isTenantAdmin`) costuma bypassar checagens específicas (ex.: chat em `chatAccess.ts`).
- Há **dois mecanismos** de validação no backend:
  - **Permission engine** (`packages/backend/src/permissions/permissionEngine.ts` + `assertModulePermission` em `permissions/assertModulePermission.ts`): usa `checkPermission`, **nega** se o módulo não existir no mapa (`!p`).
  - **Legado** em `modulePermissionsService.ts`: exporta `assertModulePermission` **diferente** (só `create`/`edit`/`delete`, sem `view`) e com **`if (!p) return`** — ou seja, **ausência de chave no mapa = permite** (comportamento perigoso; ainda usado em `appointmentsController.ts`).

### 1.2 Formato armazenado (colunas + JSON)

Por módulo, cada linha em `role_module_permissions` ou `custom_role_module_permissions` contém:

| Campo | Tipo | Significado na UI atual |
|-------|------|-------------------------|
| `module` | text | id do módulo (ex.: `chat`, `finance`) |
| `can_view` | bool | “Visualizar” |
| `can_create` | bool | “Criar” |
| `can_edit` | bool | “Editar” (no chat, usado como proxy para várias ações) |
| `can_delete` | bool | “Excluir” |
| `edit_own_only` | bool | editar só próprios/atribuídos |
| `delete_own_only` | bool | excluir só próprios/atribuídos |
| `module_extras` | jsonb | flags específicas (propostas; chat; extensível) |

### 1.3 Catálogo de módulos (backend)

Fonte: `packages/backend/src/services/modulePermissionsService.ts` — constante `MODULE_IDS`:

`dashboard`, `clients`, `leads`, `funnels`, `products`, `projects`, `tasks`, `project_templates`, `chat`, `tickets`, `proposals`, `contracts`, `billing`, `finance`, `settings`, `meu_plano`, `agenda`.

Labels PT-BR no mesmo ficheiro (`MODULE_LABELS`). Nem todas as áreas do produto têm módulo dedicado (ex.: **loja/pedidos** podem estar sob `products` + feature flags).

### 1.4 `module_extras` hoje

- **Propostas:** `proposals_send`, `proposals_convert_invoice`, `proposals_manage_integrations` (seed/defaults em SQL e fallback no código quando coluna `module_extras` não existia).
- **Chat:** flags em `packages/backend/src/services/chatAccess.ts`, lidas de `chat.module_extras`:
  - `chat_reply`, `chat_view_all`, `chat_assign`, `chat_transfer`, `chat_close`, `chat_manage_queues`, `chat_manage_teams`, `chat_view_metrics`, `chat_manage_automation` (com defaults ligados a `can_edit` / `can_view` conforme ação).

### 1.5 Endpoints de schema e CRUD de permissões

| Método | Rota | Função |
|--------|------|--------|
| GET | `/api/me/tenant/module-permissions-schema` | lista módulos + `supportsEditOwn` / `supportsDeleteOwn` |
| GET | `/api/me/tenant/my-permissions` | mapa efetivo do usuário logado |
| GET/PUT | `/api/me/tenant/roles/:role/permissions` | permissões por role de sistema |
| GET/PUT | `/api/me/tenant/custom-roles/:id/permissions` | permissões de perfil customizado |

Handlers: `packages/backend/src/controllers/myTenantPlanController.ts`.  
**Nota:** no `PUT` de **roles de sistema**, o corpo é normalizado módulo a módulo e **não persiste `module_extras`** no objeto enviado (apenas `can_*` e `*_own_only`) — extras de propostas no role vêm do que já está na linha SQL ou defaults; **a UI atual não edita `module_extras`**. Perfis **custom** usam `setCustomRoleModulePermissions` e **podem** persistir `module_extras` se o cliente enviar.

### 1.6 Exemplo de payload (PUT permissões)

```json
{
  "permissions": {
    "chat": {
      "can_view": true,
      "can_create": false,
      "can_edit": true,
      "can_delete": false,
      "edit_own_only": false,
      "delete_own_only": false,
      "module_extras": {
        "chat_reply": true,
        "chat_transfer": false,
        "chat_view_all": false
      }
    },
    "finance": {
      "can_view": false,
      "can_create": false,
      "can_edit": false,
      "can_delete": false,
      "edit_own_only": false,
      "delete_own_only": false
    }
  }
}
```

Na prática, o diálogo atual (`RolePermissionsDialog`) **não monta nem envia** `module_extras` — só os seis campos CRUD.

### 1.7 Frontend — tela “Permissões por módulo”

- `src/components/settings/RolePermissionsDialog.tsx`: tabela genérica Visualizar / Criar / Editar / Excluir + próprios.
- Texto de ajuda reproduz a frase que o produto considera genérica demais.
- Dados: `src/services/modulePermissions.ts` + contexto global `src/contexts/ModulePermissionsContext.tsx`.

### 1.8 Como o frontend interpreta o mapa

Em `ModulePermissionsContext`, se **não houver entrada** para um `moduleId`, `canView` / `canCreate` / `canEdit` / `canDelete` retornam **`true`** (fail-open para módulo ausente). Isso é o oposto do engine de permissões e facilita ver UI/actions quando o mapa está incompleto ou falha o fetch.

---

## 2. Módulos operacionais vs produto

Mapeamento **módulo backend** ↔ **rotas principais** (de `src/App.tsx`) e notas:

| Módulo (id) | Rotas / áreas típicas | Observação |
|-------------|----------------------|------------|
| `dashboard` | `/dashboard` | Mistura KPIs comerciais/financeiros/atendimento sem granularidade fina. |
| `clients` | `/clients`, detalhe cliente | CRUD + `own_only` no backend em vários endpoints. |
| `leads` | `/leads` | Idem. |
| `funnels` | `/funnel`, estágios | “Funil de vendas” no schema. |
| `products` | `/products`, `/admin/products`, loja | Catálogo/loja; parte em `/admin/*`. |
| `projects` | `/projects` | Projetos. |
| `tasks` | `/tasks` | Tarefas. |
| `project_templates` | `/project-templates` | Templates. |
| `chat` | `/chat`, floating chat | Ações finas via `chatAccess` + `module_extras`; rotas só `tenantAuthCrm` + `requireFeature('chat')`. |
| `tickets` | `/support/tickets` | Tickets. |
| `proposals` | `/proposals` | CRUD + extras propostas. |
| `contracts` | `/contracts` | CRUD. |
| `billing` | `/customer-invoices`, `/crm-subscriptions`, `/customer-charges`, `/billing` | Faturamento/cobranças/assinaturas agregados como “Faturamento”. |
| `finance` | `/finance/*` | Despesas, contas, contas a pagar, etc. |
| `settings` | `/settings`, integrações, usuários | Configurações. |
| `meu_plano` | plano/billing tenant | “Meu Plano”. |
| `agenda` | `/agenda` | Compromissos; controller usa `assertModulePermission` **legado** do service. |

**Ações genéricas que não refletem o domínio:** para `chat`, “criar/excluir” não correspondem a “enviar mensagem”, “assumir fila”, “grupo WhatsApp”, etc. Para `billing`/`finance`, um único `can_view` não separa “ver fatura” de “ver P&L no dashboard”.

---

## 3. Matriz proposta de permissões (inicial)

Convenção sugerida: `domínio.ação` ou `módulo.recurso.ação`. Abaixo consolida o briefing + alinhamento aos módulos já existentes.

### Chat

- `chat.view`
- `chat.view_queue`
- `chat.view_own_conversations` / `chat.view_all_conversations` (ou manter `module_extras` até migração)
- `chat.send_message`
- `chat.take_attendance`
- `chat.transfer_attendance`
- `chat.close_attendance`
- `chat.reopen_attendance`
- `chat.assign_to_user`
- `chat.manage_tags`
- `chat.create_invoice_from_chat`
- `chat.create_proposal_from_chat`
- `chat.create_contract_from_chat`
- `chat.schedule_from_chat`
- `chat.manage_groups`
- `chat.create_group`
- `chat.manage_group_participants`
- `chat.manage_queues`, `chat.manage_teams`, `chat.view_metrics`, `chat.manage_automation` (já espelhados em extras)

### Financeiro (despesas / contas)

- `finance.view_dashboard_cards`
- `finance.view_revenue` (se aplicável ao produto unificado)
- `finance.view_expenses`
- `finance.view_profit`
- `finance.create_expense`, `finance.edit_expense`, `finance.delete_expense`
- `finance.view_accounts_payable`, `finance.pay_accounts`
- `finance.view_reports`

### Faturamento (`billing`)

- `billing.view`, `billing.create_invoice`, `billing.edit_invoice`, `billing.cancel_invoice`, `billing.delete_invoice`, `billing.send_invoice`, `billing.view_all`, `billing.view_own`, `billing.mark_paid`, `billing.refund`
- Cobranças/assinaturas podem ser sub-recursos: `billing.subscriptions.*`, `billing.charges.*`

### Propostas / Contratos

- Alinhar com ações reais: `proposals.view`, `proposals.create`, …, `proposals.send`, `proposals.convert_to_contract`, `proposals.convert_invoice` (já parcialmente em extras).
- Contratos: `contracts.view`, `contracts.create`, `contracts.edit`, `contracts.delete`, `contracts.send`, `contracts.request_signature`, `contracts.view_all`, `contracts.view_own`.

### Agenda

- `agenda.view`, `agenda.create_event`, `agenda.edit_event`, `agenda.delete_event`, `agenda.view_team_calendar`, `agenda.create_meet`, `agenda.send_reminder`

### Clientes / Leads

- `clients.*`, `leads.*` com `view_all` / `view_own` / `export` onde fizer sentido.

### Dashboard

- `dashboard.view`
- `dashboard.view_sales_cards`, `dashboard.view_financial_cards`, `dashboard.view_attendance_cards`, `dashboard.view_tasks_cards`, `dashboard.view_projects_cards`

### Configurações

- `settings.view`, `settings.edit_company`, `settings.manage_users`, `settings.manage_permissions`, `settings.manage_integrations`, `settings.manage_whatsapp`, `settings.manage_billing`

**Nota de implementação futura:** o catálogo pode permanecer em BD ou em código versionado (`permission catalog`), com migração que expande cada `can_*` antigo para o conjunto mínimo de flags novas.

---

## 4. Aplicação no backend (amostra crítica)

### 4.1 Padrões observados

- Vários controllers usam `assertModulePermission` do **pacote** `permissions/` (correto, fail-closed para view/create/edit/delete e extras de propostas).
- **Dashboard:** `GET /api/dashboard/overview` em `dashboardController.getExecutiveOverview` — **sem** checagem de `dashboard`/`finance`/`billing`; apenas `tenantId` + queries amplas (receita, despesas, funil, chat, etc.). **Qualquer usuário autenticado do tenant** pode obter dados agregados sensíveis via API.
- **Chat:** router com `tenantAuthCrm` + `requireFeature('chat')`; ações específicas checadas **dentro** dos controllers via `canChatAction` / `getChatReplyDeniedReason` (não há `requirePermission` por rota na maioria dos endpoints).
- **Agenda:** uso do `assertModulePermission` **legado** do `modulePermissionsService` (create/edit/delete sem view unificada; possível fail-open se chave ausente).

### 4.2 Tabela indicativa — endpoints vs granularidade

| Endpoint / área | Permissão atual (resumo) | Permissão correta (alvo) | Risco |
|-------------------|--------------------------|---------------------------|-------|
| `GET /api/dashboard/overview` | Só auth tenant | Filtrar payload por `dashboard.*`, `billing.*`, `finance.*`, `chat.*`, … | **Alto** — vazamento financeiro/comercial |
| `GET /api/dashboard/*` (outros) | Idem provável | Idem | Alto |
| `POST /api/chat/messages` | Feature + `canChatAction('reply')` | `chat.send_message` explícito | Médio |
| `GET /api/chat/conversations` | Feature + lógica interna | `chat.view` + escopo fila/todos | Médio |
| Rotas grupo WhatsApp (`/conversations/:id/group/*`) | Auth + feature | `chat.manage_groups`, etc. | Alto se não centralizado |
| `GET/PUT /api/me/tenant/roles/:role/permissions` | Admin tenant | `settings.manage_permissions` | Médio |
| Finance (`financialController`) | Vários `assertModulePermission(..., 'finance', ...)` | Manter + alinhar com novas chaves | Baixo onde já há assert |
| Propostas / Contratos | Engine + extras | Expandir catálogo | Baixo–médio |

*(Completar em implementação com grep sistemático por router sem `requirePermission`.)*

---

## 5. Aplicação no frontend

| Tela / componente | Problema | Permissão correta (alvo) | Ajuste |
|-------------------|----------|---------------------------|--------|
| `Dashboard.tsx` — **desktop**, linha principal (receita, gráfico, funil) | **Não** usa `show(...)` / `canView('billing'|'finance')` — cartões aparecem com dados mesmo sem permissão financeira | `dashboard.view_financial_cards`, `billing.view`, etc. | Condicionar render + não pedir dados sensíveis |
| `Dashboard.tsx` — **mobile** “Indicadores do período” | Só `show(hasDashboard, "dashboard")` mas mostra receita/conversão/ticket | Separar cards comerciais vs financeiros | Granular |
| `ModulePermissionsContext` | Módulo ausente ⇒ `can*` = **true** | Negar por omissão ou exigir mapa completo | Alinhar com backend |
| `RolePermissionsDialog` | Sem edição de `module_extras` do chat | Todas as chaves do chat | Nova UI por módulo |
| Menus (`MobileAppNavigation`, etc.) | Usam `canView(moduleId)` — melhor que dashboard, mas rotas diretas podem persistir | Route guard por módulo | `AuthGuard` ou wrapper por rota |
| `AuthGuard.tsx` | Só autenticação / superadmin | Não valida módulo | Backend deve bloquear; frontend reforça |

---

## 6. Arquitetura segura (recomendada)

### Backend

- Toda ação sensível: **`requirePermission('domínio.ação')`** na rota **ou** `assertModulePermission` estendido com o mesmo catálogo.
- **Uma única** implementação de `assertModulePermission` (remover duplicata legada ou fazer delegar ao engine).
- **Dashboard:** compor resposta no servidor com base no mapa efetivo do usuário (ou endpoints separados por domínio com permissão própria).

### Frontend

- Esconder menu/cards/botões conforme o mesmo catálogo (`usePermission('chat.send_message')`).
- **Nunca** confiar só no frontend; testes de API sem cookie de admin devem receber 403.

---

## 7. Compatibilidade com permissões antigas

1. **Admin/owner:** mantém wildcard ou todas as flags novas `true`.
2. **Mapeamento:** exemplos:
   - `chat.view` ← `chat.can_view`
   - `chat.send_message` ← `chat.can_edit` && `chat_reply` !== false (ou `can_view` se política for conservadora)
   - `finance.view_dashboard_cards` ← `finance.can_view` **ou** `billing.can_view` (definir política explícita)
   - `dashboard.view_financial_cards` ← `finance.can_view` OR `billing.can_view`
3. **Migration SQL ou job:** ler `role_module_permissions` e `custom_role_module_permissions`, escrever novo JSON (`module_extras` expandido ou nova coluna `permission_grants` se necessário).
4. **Versão:** já existe `user_permission_versions` — incrementar após migração para forçar refresh do cliente.

---

## 8. UI nova (diretrizes)

- Por módulo: lista de **ações nomeadas** com descrição curta (não só CRUD).
- Chat: checkboxes alinhados à matriz da secção 3.
- Financeiro / Dashboard: separar “ver resumo”, “ver receitas no dashboard”, “criar despesa”.
- Persistência: estender PUT para aceitar `module_extras` completo ou migrar para tabela normalizada `permission_grants(user_id, key, allowed)`.

---

## 9. Plano de implementação em fases

1. **Fase 1 — Auditoria (esta entrega):** modelo, falhas, matriz, riscos.
2. **Fase 2 — Base:** catálogo central de chaves; `requirePermission` genérico para chaves string; `usePermission`; migração/backfill; remover fail-open no frontend; unificar `assertModulePermission`.
3. **Fase 3 — Chat:** rotas + UI flutuante + grupos alinhados ao catálogo.
4. **Fase 4 — Financeiro / Dashboard:** filtrar `getExecutiveOverview` e gating no React.
5. **Fase 5 — Comercial:** clientes, leads, propostas, contratos — `view_all` / `view_own`.
6. **Fase 6 — Configurações:** usuários, permissões, WhatsApp, integrações.

---

## 10. Riscos de migração

- **Regressão:** usuários sem `finance` que dependiam visualmente do dashboard podem perder cards — comunicar e revisar política “comercial vs financeiro”.
- **Duplicidade de APIs:** `assertModulePermission` em dois sítios — risco de corrigir um e esquecer o outro.
- **Payload PUT roles:** perda silenciosa de `module_extras` ao gravar roles de sistema pela UI antiga.
- **Performance:** checagem por rota — cache `permissionMap` em `req` já existe; manter.

---

## 11. Primeira fase recomendada para implementação

1. **Corrigir superfície de maior vazamento:** `GET /api/dashboard/overview` (e equivalentes) para **não devolver** blocos financeiros/faturamento sem permissão; em paralelo, **gating** no `Dashboard.tsx` desktop.
2. **Unificar** `assertModulePermission` (eliminar fail-open legado ou redirecionar appointments para o engine).
3. **Frontend:** alterar `ModulePermissionsContext` para **fail-closed** quando o mapa carregado não contiver o módulo (ou quando `loading === false` e chave ausente ⇒ false), alinhado ao backend.
4. Só depois disso: expandir catálogo granular e nova UI de perfis.

---

## Anexo A — Ficheiros principais

| Área | Caminho |
|------|---------|
| IDs e labels de módulos | `packages/backend/src/services/modulePermissionsService.ts` |
| Perfis custom | `packages/backend/src/services/customRolesService.ts` |
| Engine | `packages/backend/src/permissions/permissionEngine.ts` |
| assert (correto) | `packages/backend/src/permissions/assertModulePermission.ts` |
| assert legado | `packages/backend/src/services/modulePermissionsService.ts` |
| Middleware | `packages/backend/src/permissions/requirePermission.ts` |
| Chat granular | `packages/backend/src/services/chatAccess.ts` |
| Rotas dashboard | `packages/backend/src/routes/dashboardRoutes.ts` |
| Overview | `packages/backend/src/controllers/dashboardController.ts` |
| Rotas chat | `packages/backend/src/routes/chatRoutes.ts` |
| API permissões / me | `packages/backend/src/controllers/myTenantPlanController.ts` |
| Schema SQL | `database/init/51_role_module_permissions.sql`, `53_tenant_custom_roles.sql`, `122_proposals_etapa5_outbound.sql` |
| UI permissões | `src/components/settings/RolePermissionsDialog.tsx` |
| Contexto FE | `src/contexts/ModulePermissionsContext.tsx` |
| Dashboard UI | `src/pages/Dashboard.tsx` |

---

*Fim do relatório. Próximo passo sugerido: validar com produto a política exata de “usuário só com dashboard vê o quê” e fechar a matriz `billing` vs `finance` antes de codificar filtros no overview.*
