# Plano de implementação — Perfil da empresa (Super Admin)

Este documento detalha o plano para implementar os recursos descritos em `perfilempresa.md` no gerenciamento da empresa do Super Admin, com menu lateral e seções dedicadas.

---

## Visão geral da estrutura

A página da empresa (`/superadmin/clients/:id`) passará a ter:

- **Header fixo:** nome da empresa + badge de status + botão "Acessar sistema do cliente" + ações globais (ativar, suspender, trocar plano).
- **Menu lateral interno:** navegação entre as seções sem sair da página da empresa.
- **Conteúdo dinâmico:** uma seção por vez (Resumo, Faturamento, Usuários, etc.).

---

## Estado atual vs. desejado

| Seção | Situação atual | O que falta |
|-------|----------------|-------------|
| **1. Resumo** | Parcial (dados básicos em cards) | Dashboard resumido, próxima cobrança, botão acessar sistema, ações rápidas no topo |
| **2. Faturamento** | Inexistente (invoices por user/client, não por tenant) | Modelo de cobrança por tenant, histórico, próxima cobrança, gerar cobrança, trocar plano |
| **3. Usuários** | Só contato principal | Lista de usuários do tenant, perfil/função, último acesso, status, "acessar como" |
| **4. Configurações** | Parcial (nome, domínio, contato) | Timezone, logo, idioma; centralizar em uma aba |
| **5. Recursos** | Existe (página Features) | Integrar na aba "Recursos" com resumo + link para override |
| **6. Limites e uso** | Lógica existe (tenantLimitService) | Tela de uso (usuários, perfis); armazenamento/contatos se houver métricas |
| **7. Observações** | Inexistente | Tabela de notas internas, tags, histórico de atendimento |
| **8. Logs** | Parcial (audit log global + plan history) | Aba dedicada com filtro por tenant (alterações de plano, suspensões, acessos admin) |

---

## Fase 0 — Estrutura da página (menu lateral + layout)

**Objetivo:** mesma URL `/superadmin/clients/:id`, conteúdo trocado por sub-rota ou state (abas).

### Opção A — Sub-rotas (recomendado)

- Rotas: `/superadmin/clients/:id`, `/superadmin/clients/:id/resumo`, `/superadmin/clients/:id/faturamento`, etc.
- `Outlet` dentro da página da empresa: layout com sidebar + área de conteúdo.
- Menu lateral: links para cada rota; destaque da aba ativa.

### Opção B — Abas sem mudar URL

- Um state `tab` (resumo | faturamento | usuarios | …).
- Menu lateral altera `tab`; conteúdo renderiza conforme `tab`.
- URL pode ser só `/superadmin/clients/:id` ou `/superadmin/clients/:id?tab=faturamento`.

### Tarefas Fase 0

1. **Layout com sidebar**
   - Criar componente `SuperAdminClientLayout` (ou equivalente): header da empresa (nome, status, botão "Acessar sistema do cliente", ações rápidas) + menu lateral (itens do perfilempresa.md) + `<Outlet />` ou conteúdo da aba.
2. **Rotas**
   - Definir rotas aninhadas em `App.tsx`: `clients/:id` com children `resumo`, `faturamento`, `usuarios`, `configuracoes`, `recursos`, `limites`, `observacoes`, `logs`. Ou uma única rota com query `?tab=`.
3. **Header da empresa**
   - Nome + badge de status (Ativo / Suspenso / Trial).
   - Botão "Acessar sistema do cliente" (abre o app em nome do tenant, ex.: link para front com token de impersonation ou subdomínio).
   - Ações: Ativar, Suspender, Trocar plano (podem abrir seção ou modal conforme definição).

Entregável: navegação entre seções funcionando; conteúdo de cada seção pode ser placeholder.

---

## Fase 1 — Resumo (dashboard do cliente)

**Objetivo:** primeira aba como "dashboard administrativo" do cliente.

### Backend

- Nenhuma API nova obrigatória; usar:
  - `GET /api/superadmin/tenants/:id` (já existe)
  - `GET /api/superadmin/tenants/:id/plan-history` (já existe)
- Opcional: endpoint `GET /api/superadmin/tenants/:id/summary` que devolve: nome, status, plano, data criação, próxima cobrança (quando existir modelo de cobrança).

### Frontend

- Página/componente **Resumo**:
  - Nome da empresa, status, plano atual, data de criação.
  - Próxima cobrança: exibir "—" ou valor quando houver faturamento (Fase 2).
  - Botão "Acessar sistema do cliente" (link ou ação de impersonation).
  - Ações rápidas: Ativar conta, Suspender conta (reutilizar lógica atual de status).

Entregável: aba Resumo completa com dados atuais; botão e ações no header ou na própria aba.

---

## Fase 2 — Faturamento

**Objetivo:** controle financeiro por empresa (tenant).

### Backend

1. **Modelo de dados**
   - Decisão: cobranças atreladas ao **tenant** (recomendado) ou ao usuário principal.
   - Criar tabela, ex.: `tenant_billing` ou `tenant_invoices`:
     - `tenant_id`, `plan_id`, `billing_interval`, `amount_cents`, `due_date`, `status` (pending | paid | overdue), `paid_at`, `created_at`, etc.
   - Ou estender `invoices` com `tenant_id` e regras de negócio por tenant.
2. **APIs**
   - `GET /api/superadmin/tenants/:id/billing` — plano atual, próxima cobrança, histórico de cobranças, status do pagamento.
   - `POST /api/superadmin/tenants/:id/billing/charge` — gerar cobrança (cria registro e pode enviar notificação).
   - Trocar plano: já existe `PUT /api/superadmin/tenants/:id` com `plan_id`; na UI pode haver fluxo "Trocar plano" que altera e opcionalmente gera nova cobrança.

### Frontend

- Aba **Faturamento**:
  - Plano atual, próxima cobrança, status do pagamento.
  - Histórico de cobranças (tabela).
  - Botão "Gerar cobrança".
  - Botão "Trocar plano" (abre seletor de plano e chama API de atualização do tenant).

Entregável: faturamento por empresa funcionando (gerar cobrança, histórico, trocar plano).

---

## Fase 3 — Usuários

**Objetivo:** listar e gerir usuários vinculados à empresa; "último acesso" e "acessar como".

### Backend

1. **Listagem**
   - `GET /api/superadmin/tenants/:id/users` — lista usuários com `tenant_id = :id`; retornar: `id`, `email`, `first_name`, `last_name` (via profile), `role`/perfil se existir, `last_login_at` (ou `last_used_at` da sessão), `is_active` (se houver).
2. **Último acesso**
   - Usar `sessions.last_used_at` (ou criar campo `users.last_login_at` atualizado no login). Query: por usuário do tenant, pegar MAX(last_used_at) das sessions ou last_login_at.
3. **Acessar como usuário (impersonation)**
   - Endpoint seguro: ex. `POST /api/superadmin/impersonate` com `userId` (e validar que o user pertence a um tenant que o super admin pode gerenciar). Gera um token temporário no lugar do usuário e retorna URL do front + token (ou cookie) para "acessar como" esse usuário.
   - Middleware: garantir que apenas super admin pode chamar e que o usuário alvo pertence a um tenant.

### Frontend

- Aba **Usuários**:
  - Tabela: nome, e-mail, perfil/função, último acesso, status (ativo/inativo).
  - Ação "Acessar como" (chama API de impersonation e redireciona para o app com token do usuário).

Entregável: lista de usuários do tenant com último acesso e ação "Acessar como" (com segurança no backend).

---

## Fase 4 — Configurações

**Objetivo:** dados institucionais da empresa em uma única aba.

### Backend

1. **Campos adicionais no tenant (se necessário)**
   - Migration: adicionar em `tenants` (ou em tabela de configurações do tenant): `timezone` (TEXT), `locale` (idioma), `logo_url` (TEXT). Email institucional pode ser o do contato principal ou um campo `contact_email` no tenant.
2. **APIs**
   - `GET/PUT /api/superadmin/tenants/:id` já permitem atualizar nome, slug, domain. Estender para timezone, locale, logo_url se forem persistidos no tenant.

### Frontend

- Aba **Configurações**:
  - Nome, e-mail (contato principal ou institucional), domínio, timezone, idioma, logo (upload ou URL).
  - Formulário com "Salvar" que chama `PUT /api/superadmin/tenants/:id` (e endpoint de primary-user se o e-mail for do contato).

Entregável: configurações centralizadas; novos campos no banco se forem aprovados.

---

## Fase 5 — Recursos e funcionalidades

**Objetivo:** gestão de features na própria aba (sem depender só da página externa).

### Backend

- Já existe: `GET/PUT /api/superadmin/tenants/:id/features`, `GET /api/superadmin/plans/feature-keys`. Opcional: endpoint que retorna "recursos do plano" + "overrides do tenant" em um único payload para a aba.

### Frontend

- Aba **Recursos**:
  - Listar funcionalidades ativas/desativadas e recursos incluídos no plano (a partir do plano atual do tenant).
  - Exibir overrides por empresa (quais features estão ligadas/desligadas em relação ao plano).
  - Botão "Gerenciar features" que leva para a página atual de override (`/superadmin/tenants/:id/features`) ou incorporar o mesmo conteúdo (checkboxes) nesta aba.

Entregável: aba Recursos com visão do plano + overrides e link ou conteúdo de gestão de features.

---

## Fase 6 — Limites e uso

**Objetivo:** mostrar consumo e limites do plano.

### Backend

1. **API de uso**
   - `GET /api/superadmin/tenants/:id/usage` que retorna:
     - `users`: { current, limit } (usando tenantLimitService).
     - `profiles`: { current, limit } (idem).
     - `storage_mb`: se houver medição de armazenamento (ex.: anexos, arquivos por tenant); senão retornar null ou 0.
     - `contacts_count`: se existir entidade "contacts" ou "leads" por tenant, contar; senão null.
2. **Limites do plano**
   - Incluir no mesmo payload: `plan_limits: { max_users, max_profiles }` (e outros limites futuros).

### Frontend

- Aba **Limites e uso**:
  - Cards ou tabela: uso atual vs. limite (usuários, perfis, armazenamento, contatos).
  - Barra de progresso ou texto "X / Y" para cada recurso.
  - Mensagem quando próximo do limite (opcional).

Entregável: tela de limites e uso baseada em dados reais (usuários e perfis já suportados).

---

## Fase 7 — Observações administrativas

**Objetivo:** notas internas e tags para a equipe.

### Backend

1. **Modelo**
   - Tabela `tenant_admin_notes` (ou `tenant_notes`): `id`, `tenant_id`, `author_id` (super admin user), `content` (TEXT), `is_pinned` (boolean), `created_at`, `updated_at`.
   - Tabela `tenant_tags`: `id`, `tenant_id`, `tag` (TEXT), `created_at`. Ou um campo JSONB `tags` em uma tabela `tenant_metadata`.
   - Opcional: tabela `tenant_support_log` para histórico de atendimento: `tenant_id`, `author_id`, `action` (texto), `created_at`.
2. **APIs**
   - `GET /api/superadmin/tenants/:id/notes` — lista notas (e tags se em tabela separada).
   - `POST /api/superadmin/tenants/:id/notes` — criar nota.
   - `PUT/DELETE /api/superadmin/tenants/:id/notes/:noteId` — editar/remover nota.
   - `GET/PUT /api/superadmin/tenants/:id/tags` — listar/atualizar tags (array de strings).

### Frontend

- Aba **Observações**:
  - Lista de notas (com opção de fixar); campo para nova nota.
  - Tags: exibir e editar (chips ou input com múltiplas tags).
  - Histórico de atendimento: lista de eventos (se implementado no backend).

Entregável: notas e tags por empresa; histórico de atendimento se for implementado.

---

## Fase 8 — Logs e atividades

**Objetivo:** auditoria e diagnóstico por tenant.

### Backend

1. **Filtrar auditoria por tenant**
   - `GET /api/superadmin/audit-log` já existe; adicionar query param `entity_id` + `entity_type=tenant` para filtrar por tenant. Ou endpoint dedicado: `GET /api/superadmin/tenants/:id/audit-log` que retorna apenas eventos onde `entity_type = 'tenant'` e `entity_id = :id`, mais eventos de "tenant.plan_changed", "tenant.updated", etc.
2. **Dados**
   - Incluir: alterações de plano (já em tenant_plan), suspensões (status), acessos administrativos (quando super admin altera o tenant), e outros eventos relevantes (ex.: criação de cobrança, notas admin).

### Frontend

- Aba **Logs**:
  - Tabela ou lista cronológica: data, ação, usuário (admin), detalhes.
  - Filtros opcionais: tipo de evento, período.

Entregável: aba Logs com eventos do tenant e link ou integração com o audit log global.

---

## Ordem sugerida de implementação

| Ordem | Fase | Motivo |
|-------|------|--------|
| 1 | **Fase 0** — Estrutura (menu lateral + layout) | Base para todas as abas |
| 2 | **Fase 1** — Resumo | Melhora a primeira impressão e usa dados já existentes |
| 3 | **Fase 4** — Configurações | Pouco backend novo; unifica o que já existe |
| 4 | **Fase 5** — Recursos | Reaproveita APIs atuais |
| 5 | **Fase 6** — Limites e uso | Reaproveita tenantLimitService |
| 6 | **Fase 8** — Logs | Filtro no audit log existente |
| 7 | **Fase 3** — Usuários | Listagem + último acesso + impersonation |
| 8 | **Fase 7** — Observações | Novas tabelas e APIs |
| 9 | **Fase 2** — Faturamento | Modelo de cobrança por tenant e fluxos de pagamento |

---

## Resumo de novos artefatos (estimativa)

- **Migrations:** `tenant_billing` (ou extensão de invoices), `tenant_admin_notes`, `tenant_tags` (ou metadata); campos opcionais em `tenants` (timezone, locale, logo_url).
- **Backend:** endpoints de billing, usage, notes, tags, audit por tenant, impersonation.
- **Frontend:** layout com sidebar, 8 componentes de aba (ou sub-rotas), header com nome + status + "Acessar sistema" + ações globais.

---

## UX (recomendações do perfilempresa.md)

- Nome da empresa + badge de status no header.
- Botão "Acessar sistema do cliente" sempre visível (header).
- Ações globais no topo: Ativar, Suspender, Trocar plano.
- Menu lateral interno da empresa (Resumo, Faturamento, Usuários, Configurações, Recursos, Limites, Observações, Logs).

Isso fecha o desenho do "painel administrativo dedicado ao cliente" e orienta a implementação faseada acima.

---

## Status de implementação

- [x] **Fase 0** — Estrutura (menu lateral + layout)
- [x] **Fase 1** — Resumo
- [x] **Fase 2** — Faturamento
- [x] **Fase 3** — Usuários
- [x] **Fase 4** — Configurações (timezone, logo, idioma)
- [x] **Fase 5** — Recursos (integrar na aba)
- [x] **Fase 6** — Limites e uso
- [x] **Fase 7** — Observações (notas, tags)
- [x] **Fase 8** — Logs (audit por tenant)

**Status:** Todas as fases do perfil da empresa (0 a 8) foram implementadas.

**Próximos passos sugeridos (fora deste plano):**
- Melhorias de UX e testes E2E no fluxo do perfil da empresa.
- Integrações adicionais (pagamento, notificações por e-mail, histórico de atendimento completo).
- Ver `PLANO-PAINEL-SUPER-ADMIN.md` para outras funcionalidades do painel Super Admin.
