# Plano de Implantação – Painel de Super Admin

**Objetivo:** Gestão centralizada de planos, clientes (contas) e feature flags, com usuário super admin dedicado.

**Escopo:** Todas as sugestões (essenciais, importantes e desejáveis) aplicadas. Implementação por **Etapas**: iniciar com **Etapa 1** e seguir em sequência (Etapa 2, 3, …). Cada etapa pode ser iniciada com “ok etapa N”.

---

## 1. Visão geral

| Item | Descrição |
|------|-----------|
| **O que é** | Área restrita `/superadmin` acessível apenas por usuário(s) com role `super_admin`. |
| **Funções** | Gerenciar planos, clientes (tenants), feature flags por plano e por cliente; dashboard; auditoria; relatórios; exportação; multi-super-admin; notificações. |
| **Integração** | Feature flags vinculadas a planos; backend e frontend checam plano/features antes de liberar recurso. |

---

## 2. Recursos necessários (resumo)

- **Banco:** `plans`, `plan_features`, `tenants`, `tenant_plan`, `tenant_feature_overrides`, `features`, `super_admin_audit_log`; coluna `is_super_admin` em `users` ou role `super_admin` em `user_roles`.
- **Backend:** rotas `/api/superadmin/*`, middleware `requireSuperAdmin`, serviços (Plan, Tenant, FeatureFlag, Audit, Export, Notifications), helper `userHasFeature`, `GET /api/me/features`.
- **Frontend:** rotas `/superadmin/*`, layout próprio, guard de acesso, hook `useFeatureFlag`.

---

## 3. Modelo de dados (resumo)

- **users** – opcional: `is_super_admin BOOLEAN`; ou **user_roles** com `role = 'super_admin'`, `profile_id = NULL`.
- **plans** – id, name, slug, description, price_cents, billing_interval, max_users, max_profiles, is_active, sort_order.
- **plan_features** – plan_id, feature_key, enabled; UNIQUE(plan_id, feature_key).
- **tenants** – id, name, slug, domain, plan_id, status (active/suspended/trial), trial_ends_at.
- **tenant_plan** – tenant_id, plan_id, starts_at, ends_at (histórico).
- **tenant_feature_overrides** – tenant_id, feature_key, enabled; UNIQUE(tenant_id, feature_key).
- **features** – id, key, name, description, sort_order (cadastro editável de recursos).
- **super_admin_audit_log** – user_id, action, entity_type, entity_id, payload, created_at.

---

## 4. Lista de sugestões – todas incluídas no plano

Todas abaixo estão distribuídas nas **Etapas** da seção 5.

| # | Item | Etapa |
|---|------|--------|
| 1 | Planos – CRUD básico | 2 |
| 2 | Planos – Features por plano | 2 |
| 3 | Clientes (tenants) – CRUD básico | 3 |
| 4 | Feature flags – resolução no backend | 4 |
| 5 | Feature flags – no frontend | 4 |
| 6 | Usuário super admin | 1 |
| 7 | Rota e layout Super Admin | 1 |
| 8 | Middleware/guard super admin | 1 |
| 9 | Override de features por cliente | 4 |
| 10 | Dashboard super admin | 5 |
| 11 | Histórico de alteração de plano | 5 |
| 12 | Limites por plano (max_users, max_profiles) | 5 |
| 13 | Trial por cliente | 5 |
| 14 | Log de ações do super admin (auditoria) | 5 |
| 15 | Métricas e relatórios | 6 |
| 16 | Multi-super-admin | 6 |
| 17 | Notificações para super admin | 6 |
| 18 | Exportação CSV/Excel | 6 |
| 19 | API pública para feature flags (`GET /api/me/features`) | 4 |
| 20 | Tela de recursos do sistema (cadastro editável) | 6 |

---

## 5. Etapas de implementação

Cada **Etapa** é um bloco de trabalho. Inicie com **“ok etapa 1”**; ao concluir, passe para a próxima.

---

### Etapa 1 – Fundação (super admin + acesso)

**Itens da lista:** 6, 7, 8.

**O que fazer:**

- **1.1** Migration no banco:
  - Adicionar coluna `is_super_admin BOOLEAN DEFAULT false` em `users` **ou** adicionar valor `'super_admin'` ao enum `app_role` e usar `user_roles` com `profile_id = NULL` para super admin global.
- **1.2** Script ou migration para criar o primeiro usuário super admin (email e senha via `.env` ou constante; hash com `generate-password-hash.mjs`); criar perfil em `profiles` se necessário.
- **1.3** Backend:
  - Middleware `requireSuperAdmin` (verificar JWT + `is_super_admin` ou role `super_admin`).
  - Rotas base em `/api/superadmin` (ex.: `GET /api/superadmin/me` retornando ok para super admin).
  - Incluir no login/me o campo `is_super_admin` ou lista de `roles` (com `super_admin` quando aplicável).
- **1.4** Frontend:
  - Rota `/superadmin` com layout próprio (menu lateral: Dashboard, Planos, Clientes, Features, etc.).
  - Guard de rota: se o usuário não for super admin, redirecionar para `/dashboard`.
  - Link ou botão para acessar “Super Admin” apenas quando `is_super_admin` (ou role `super_admin`) for true.

**Entregável:** Super admin criado; apenas ele acessa `/superadmin` e `/api/superadmin/*`; layout e menu do painel prontos.

---

### Etapa 2 – Planos e features por plano

**Itens da lista:** 1, 2.

**O que fazer:**

- **2.1** Migration:
  - Criar tabelas `plans` e `plan_features` (plan_id, feature_key, enabled; UNIQUE(plan_id, feature_key)).
  - Lista fixa de `feature_key` no código (ex.: dashboard, leads, clients, funnels, products, contracts, projects, tickets, chat, invoices, expenses, proposals, tasks, reports, settings, message_templates, whatsapp) ou criar tabela `features` e popular com seed.
- **2.2** Backend:
  - CRUD de planos: `GET/POST/PUT/DELETE /api/superadmin/plans`, `GET /api/superadmin/plans/:id`.
  - CRUD de features por plano: `GET/PUT /api/superadmin/plans/:id/features` (lista de feature_key com enabled).
- **2.3** Frontend:
  - Páginas listar / criar / editar planos (nome, slug, descrição, preço, intervalo, max_users, max_profiles, is_active, sort_order).
  - Tela “Features do plano”: checkboxes ou matriz plano × feature_key para marcar habilitados.
- **2.4** Seed: criar planos iniciais (ex.: Free, Pro, Enterprise) com features padrão.

**Entregável:** Planos e features por plano funcionando no painel super admin.

---

### Etapa 3 – Clientes (tenants)

**Itens da lista:** 3.

**O que fazer:**

- **3.1** Migration:
  - Criar tabela `tenants` (id, name, slug, domain, plan_id FK(plans), status, trial_ends_at, created_at, updated_at).
  - Definir vínculo usuário → tenant: ex. adicionar `tenant_id` em `users` ou considerar que o “tenant” é o dono da conta (owner de `user_profiles`) e ter tabela de vínculo `tenant_users` ou usar o primeiro user_profile do usuário como “conta” e adicionar `tenant_id` em `user_profiles`. Documentar a regra escolhida.
- **3.2** Backend:
  - CRUD de tenants: `GET/POST/PUT/DELETE /api/superadmin/tenants`; associação tenant ↔ plano; campos status e trial_ends_at.
- **3.3** Frontend:
  - Listar / criar / editar clientes (tenants): nome, slug, domínio, plano, status, trial_ends_at.

**Entregável:** Gestão de clientes (tenants) com plano e status no painel.

---

### Etapa 4 – Feature flags no sistema + override + API pública

**Itens da lista:** 4, 5, 9, 19.

**O que fazer:**

- **4.1** Backend:
  - Implementar helper `userHasFeature(userId, featureKey)`: resolver tenant do usuário → plano do tenant → `plan_features`; depois aplicar `tenant_feature_overrides` se existir tabela e dados.
  - Proteger rotas/controllers: antes de operações sensíveis (ex.: criar contrato, acessar chat), chamar `userHasFeature`; retornar 403 se não permitido.
- **4.2** Backend:
  - Migration da tabela `tenant_feature_overrides` (tenant_id, feature_key, enabled) se ainda não existir.
  - Endpoints para override: `GET/PUT /api/superadmin/tenants/:id/features` (lista de feature_key com enabled para aquele tenant).
- **4.3** Backend:
  - Endpoint `GET /api/me/features`: retornar lista de feature_key habilitados para o usuário logado (tenant → plano → plan_features → overrides). Uso em lote pelo frontend/mobile.
- **4.4** Frontend (app principal, não só super admin):
  - Hook `useFeatureFlag(key)` que usa `GET /api/me/features` (ou contexto) e retorna se a feature está habilitada; esconder ou desabilitar itens de menu e páginas conforme o retorno.
- **4.5** Frontend (super admin):
  - Na tela de edição de cliente (tenant), seção ou modal para editar override de features (checkboxes por feature_key).

**Entregável:** Feature flags aplicadas no backend e frontend; override por cliente; API `GET /api/me/features` em lote.

---

### Etapa 5 – Dashboard, histórico, limites, trial e auditoria

**Itens da lista:** 10, 11, 12, 13, 14.

**O que fazer:**

- **5.1** Migration:
  - Tabela `tenant_plan` (tenant_id, plan_id, starts_at, ends_at, created_at) para histórico de plano por tenant.
  - Tabela `super_admin_audit_log` (id, user_id, action, entity_type, entity_id, payload JSONB, created_at).
- **5.2** Backend:
  - Ao alterar plano ou status do tenant: registrar em `tenant_plan` (nova linha com starts_at = now()) e gravar ação em `super_admin_audit_log`.
  - Ao criar usuário ou perfil: verificar limites do plano do tenant (max_users, max_profiles); bloquear e retornar erro se exceder.
  - Em `userHasFeature`: se o tenant tiver status `trial` e `trial_ends_at < now()`, considerar features desativadas (ou regra definida por você).
- **5.3** Backend:
  - Endpoints de dashboard: totais (planos, clientes ativos, usuários), últimos cadastros (tenants ou users).
  - `GET /api/superadmin/audit-log` (listagem paginada do log).
- **5.4** Frontend:
  - Dashboard em `/superadmin`: cards com totais e últimos cadastros.
  - Tela `/superadmin/audit`: listagem do log de ações do super admin.
  - (Opcional) na tela do cliente, exibir histórico de planos (consulta a `tenant_plan`).

**Entregável:** Dashboard super admin, histórico de plano, limites e trial respeitados, auditoria gravada e visível.

---

### Etapa 6 – Métricas, multi-super-admin, notificações, exportação e recursos editáveis

**Itens da lista:** 15, 16, 17, 18, 20.

**O que fazer:**

- **6.1** Migration (se ainda não existir):
  - Tabela `features` (id, key UNIQUE, name, description, sort_order); seed com recursos do sistema (feature_key + nome).
- **6.2** Backend:
  - Relatórios/métricas: `GET /api/superadmin/reports/adoption`, `/revenue`, `/churn` (ou um único endpoint com filtros) – adoção por plano, receita, churn.
  - Exportação: `GET /api/superadmin/export/clients`, `/export/plans`, `/export/usage` (CSV ou Excel).
- **6.3** Backend:
  - Gestão de super admins: `GET/POST/DELETE /api/superadmin/users` (listar usuários com role super_admin, adicionar, remover); regra: não permitir remoção do último super admin; registrar ações em `super_admin_audit_log`.
- **6.4** Backend:
  - Notificações para super admin: ao criar novo tenant ou quando `trial_ends_at` estiver próximo (ex.: 7 dias), criar notificação para super admins (tabela `notifications` com user_id dos super admins ou canal dedicado).
- **6.5** Backend:
  - CRUD de recursos do sistema: `GET/POST/PUT/DELETE /api/superadmin/features` (tabela `features`); `plan_features` e overrides continuam usando `feature_key` (texto).
- **6.6** Frontend:
  - Página `/superadmin/reports`: gráficos (adoção por plano, receita, churn).
  - Página ou botões de exportação (clientes, planos, uso) em CSV/Excel.
  - Página `/superadmin/users`: listar, adicionar e remover super admins (com aviso ao remover último).
  - Página ou componente `/superadmin/notifications`: listar alertas (novo cadastro, trial próximo).
  - Página `/superadmin/features/system`: listar e editar recursos do sistema (key, name, description, sort_order).

**Entregável:** Relatórios, exportação, multi-super-admin, notificações e tela de recursos do sistema concluídos.

---

## 6. Checklist por etapa (para marcar ao concluir)

### Etapa 1
- [ ] 1.1 Migration is_super_admin ou app_role super_admin
- [ ] 1.2 Script/migration criar primeiro super admin
- [ ] 1.3 Middleware e rotas base backend; login/me com is_super_admin ou roles
- [ ] 1.4 Rota /superadmin, layout, guard frontend

### Etapa 2
- [ ] 2.1 Migration plans e plan_features; lista ou tabela features
- [ ] 2.2 CRUD planos e features por plano (backend)
- [ ] 2.3 Páginas planos e features por plano (frontend)
- [ ] 2.4 Seed planos iniciais

### Etapa 3
- [ ] 3.1 Migration tenants; vínculo usuário ↔ tenant definido
- [ ] 3.2 CRUD tenants (backend)
- [ ] 3.3 Páginas clientes/tenants (frontend)

### Etapa 4
- [ ] 4.1 userHasFeature e proteção de rotas
- [ ] 4.2 tenant_feature_overrides e endpoints override
- [ ] 4.3 GET /api/me/features
- [ ] 4.4 useFeatureFlag e esconder menu/páginas no app
- [ ] 4.5 Tela override de features por cliente no super admin

### Etapa 5
- [ ] 5.1 Migration tenant_plan e super_admin_audit_log
- [ ] 5.2 Registrar histórico e auditoria; limites e trial
- [ ] 5.3 Endpoints dashboard e audit-log
- [ ] 5.4 Dashboard e tela de auditoria no frontend

### Etapa 6
- [ ] 6.1 Tabela features e seed
- [ ] 6.2 Relatórios e exportação (backend)
- [ ] 6.3 Gestão de super admins (backend)
- [ ] 6.4 Notificações para super admin (backend)
- [ ] 6.5 CRUD recursos do sistema (backend)
- [ ] 6.6 Páginas reports, export, users, notifications, features/system (frontend)

---

## 7. Próximo passo

- Dizer **“ok etapa 1”** para iniciar a Etapa 1 (fundação: super admin + acesso ao painel).
- Após concluir a Etapa 1, seguir com **“ok etapa 2”**, e assim por diante.

---

## Anexo A – Criação do usuário Super Admin (SQL)

**Opção 1 – Coluna em users:**  
`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;`  
Depois: `UPDATE users SET is_super_admin = true WHERE email = 'superadmin@...';`

**Opção 2 – Role em user_roles:**  
`ALTER TYPE app_role ADD VALUE 'super_admin';`  
Depois: inserir em `user_roles` com `role = 'super_admin'` e `profile_id = NULL`.

**Hash da senha:** usar `packages/backend/scripts/generate-password-hash.mjs`.
