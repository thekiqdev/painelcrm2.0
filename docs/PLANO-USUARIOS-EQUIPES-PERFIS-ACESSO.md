# Plano: Estrutura de Usuários, Equipes e Controle de Acesso (Tenant)

Objetivo: organizar usuários, equipes e perfis de acesso da empresa/tenant de forma didática, respeitando o plano contratado e aproveitando o menu atual de Configurações (**Usuários** e **Gerenciar Perfis**).

---

## Modelo alvo

| Entidade | Descrição | Uso principal |
|----------|-----------|----------------|
| **Usuário** | Pessoa que acessa o sistema | Identidade individual: nome, email, senha, status, avatar, equipes vinculadas, perfil de acesso |
| **Equipe** | Agrupamento organizacional (ex.: Comercial, Design, Desenvolvimento, Financeiro) | Filtrar projetos, atribuir tarefas, permissões em lote, relatórios por área |
| **Perfil de acesso (Role)** | Conjunto de permissões (ex.: Admin, Gestor, Operacional) | Define o que o usuário pode fazer no sistema |

Relações:

- **User** → pertence a → **Equipes**
- **User** (no contexto do tenant) → possui → **Role**
- **Role** → contém → **Permissions**

Restrição de negócio:

- **Criação de usuário** deve respeitar o **limite de usuários do plano** contratado (`plans.max_users` / override por tenant).

---

## Situação atual (resumo)

- **Banco:** `users` (email, password_hash, tenant_id), `profiles` (dados do usuário 1:1), `user_profiles` (workspace/conta do tenant), `profile_members` (user ↔ user_profile), `user_roles` (user_id, role, profile_id), `user_permissions` (user_id, profile_id, permission). **Não existe o conceito de Equipe (Team)**.
- **Menu Configurações:** "Usuários" (UsersSection – tela mais estática) e "Gerenciar Perfis" (UserManagementSection – perfis + membros + permissões).
- **Planos:** `plans.max_users` e `plans.max_profiles`; tenant pode ter override de limites.

---

## Etapas do plano

Cada etapa é executada **somente quando você solicitar** (ex.: "execute a Etapa 1"). Não implementar etapas adiante até que seja pedido.

---

### Etapa 1 — Modelo de dados: Equipes

**Objetivo:** Introduzir o conceito de **Equipe** no banco e no backend, sem ainda alterar a UI de usuários/perfis.

**Escopo:**

1. **Backend / BD**
   - Criar tabela `teams` (tenant-scoped): `id`, `tenant_id`, `name`, `slug`, `description`, `created_at`, `updated_at`.
   - Criar tabela `team_members`: `id`, `team_id`, `user_id`, `role` (opcional na equipe, ex.: lead, member), `created_at`, `updated_at`, UNIQUE(team_id, user_id).
   - Migração SQL em `database/init/` (ex.: `49_teams_and_team_members.sql`).
   - Garantir que `teams` e `team_members` usem `tenant_id` (via `teams`) para multi-tenancy.

2. **Backend (API)**
   - Endpoints básicos: listar equipes do tenant, criar, editar, excluir equipe; listar membros de uma equipe; adicionar/remover membro.
   - Serviço/controller de equipes (ex.: `teamsController`, `teamsService` ou rotas em `settings`/`tenant`).

3. **Frontend (mínimo)**
   - Serviço/API client para equipes (ex.: `settingsService` ou `teamsService`) chamando os novos endpoints.
   - Nenhuma alteração obrigatória no menu de Configurações nesta etapa (pode haver uma tela interna de teste se desejar).

**Entregável:** Equipes existem no BD e na API; possível listar/criar/editar/excluir equipes e membros via API.

**Comando para executar:** *"Execute a Etapa 1 do plano de usuários e equipes"*

---

### Etapa 2 — Vincular usuário a equipes e validar limite do plano

**Objetivo:** Usuário poder pertencer a uma ou mais equipes; criação de usuário respeitando o limite do plano.

**Escopo:**

1. **Backend**
   - Ao criar usuário no tenant (ou ao adicionar membro ao perfil/tenant), verificar limite: contar usuários do tenant e comparar com `plans.max_users` (e override do tenant, se houver). Retornar erro amigável se exceder.
   - Endpoint (ou lógica existente) que retorne “limite de usuários” do tenant (ex.: `max_users`, `current_users`) para o frontend exibir.

2. **Frontend**
   - Onde houver “criar usuário” ou “adicionar membro”, exibir uso (ex.: “3 de 10 usuários”) e desabilitar ou avisar ao atingir o limite.
   - (Opcional nesta etapa) Na tela de edição/cadastro de usuário, permitir selecionar **equipes** (multiselect) e persistir em `team_members`.

**Entregável:** Limite do plano aplicado na criação de usuário; usuário pode ser vinculado a equipes (se a UI de usuário já existir nesse fluxo).

**Comando para executar:** *"Execute a Etapa 2 do plano de usuários e equipes"*

---

### Etapa 3 — Reorganizar menu e telas: “Usuários e Acesso”

**Objetivo:** Deixar o fluxo mais didático no menu de Configurações, agrupando usuários, equipes e perfis.

**Escopo:**

1. **Menu (Settings)**
   - Reorganizar itens sob uma seção clara, por exemplo:
     - **Usuários e Acesso**
       - **Usuários** — lista/cadastro de usuários do tenant (nome, email, status, avatar, equipes, perfil de acesso).
       - **Equipes** — CRUD de equipes e membros (aproveitando API da Etapa 1).
       - **Perfis de acesso** — gerenciar perfis (roles) e suas permissões (equivalente ao atual “Gerenciar Perfis”, com nomenclatura mais clara).
   - Ajustar `SettingsMenu` e `Settings.tsx` (ids e labels) para refletir a nova estrutura; manter compatibilidade com rotas/estado (ex.: query param ou state por seção).

2. **Conteúdo**
   - **Usuários:** uma única tela (ou fluxo) que mostre: lista de usuários do tenant, com indicador de equipes e perfil; botão “Novo usuário” (respeitando limite da Etapa 2); edição com campos nome, email, status, avatar, equipes vinculadas, perfil (role).
   - **Equipes:** tela listando equipes; ao clicar em uma equipe, listar membros e permitir adicionar/remover (usando `team_members`).
   - **Perfis de acesso:** reformular o atual “Gerenciar Perfis” para focar em “Perfis (roles)” com conjunto de permissões; associar usuários a um perfil (role) em vez de misturar “perfil” com “workspace”. Se hoje “perfil” no BD for o workspace (user_profiles), manter compatibilidade e expor na UI como “Perfil de acesso” com lista de permissões.

**Entregável:** Menu Configurações com seção “Usuários e Acesso” contendo Usuários, Equipes e Perfis de acesso; telas coerentes com o modelo User → Equipes + Role.

**Comando para executar:** *"Execute a Etapa 3 do plano de usuários e equipes"*

---

### Etapa 4 — Perfis de acesso (Roles) como conjuntos de permissões

**Objetivo:** Tratar “Perfil de acesso” como um role com conjunto fixo de permissões (Admin, Gestor, Operacional, etc.), e associar usuário a um role no tenant.

**Escopo:**

1. **Backend / BD**
   - Se ainda não existir, ter uma tabela ou enum de “roles” nomeados (ex.: `roles` com id, name, slug, tenant_id opcional) e uma tabela `role_permissions` (role_id, permission).
   - Ou manter uso de `app_role` e `user_roles` já existentes e garantir que cada `app_role` tenha um conjunto bem definido de permissões (mapeamento fixo no código ou em tabela).
   - Garantir que ao atribuir um role ao usuário no tenant, as permissões efetivas venham desse role (e que a UI de “Perfis de acesso” edite esses conjuntos, se for configurável por tenant).

2. **Frontend**
   - Tela “Perfis de acesso”: listar roles (ex.: Admin, Gestor, Operacional); ao editar um role, mostrar e editar as permissões que ele contém.
   - Na tela de usuário, campo “Perfil de acesso” (select de roles) em vez de lista solta de permissões, quando fizer sentido.

**Entregável:** Perfis de acesso (roles) definidos como conjuntos de permissões; usuário associado a um role; UI consistente com isso.

**Comando para executar:** *"Execute a Etapa 4 do plano de usuários e equipes"*

---

### Etapa 5 — Integração com Projetos e Tarefas (opcional)

**Objetivo:** Usar equipes para filtrar projetos e atribuir tarefas (e, se aplicável, relatórios por área).

**Escopo:**

1. **Backend**
   - Se projetos tiverem “equipe responsável” ou “área”, vincular a `teams` (ex.: `project_team_id` ou tabela `project_teams`).
   - Em tarefas, permitir atribuição por usuário e, se fizer sentido, por equipe (ex.: “equipe responsável”).

2. **Frontend**
   - Filtros de projetos por equipe; ao criar/editar projeto, opção de selecionar equipe.
   - Ao atribuir tarefa, opção de escolher usuário (e, se aplicável, equipe).

**Entregável:** Projetos e tarefas utilizam equipes onde for combinado no desenho.

**Comando para executar:** *"Execute a Etapa 5 do plano de usuários e equipes"*

---

### Etapa 6 — Ajustes finais e documentação

**Objetivo:** Polimento, consistência de nomenclatura e documentação.

**Escopo:**

- Revisar todas as telas de “Usuários e Acesso” para textos e fluxos didáticos.
- Garantir que: criação de usuário sempre valide limite do plano; usuário tenha nome, email, status, avatar, equipes e perfil de acesso visíveis e editáveis onde apropriado.
- Documentar no próprio projeto (ex.: README ou doc em `docs/`) o modelo final: User → Equipes, User → Role, Role → Permissions; onde está no BD e na API.
- Ajustes de acessibilidade e feedback (toasts, mensagens de erro) nas novas telas.

**Comando para executar:** *"Execute a Etapa 6 do plano de usuários e equipes"*

---

## Ordem sugerida e dependências

| Ordem | Etapa | Depende de |
|-------|--------|-------------|
| 1 | Etapa 1 — Equipes (BD + API) | — |
| 2 | Etapa 2 — Limite de plano + usuário ↔ equipes | Etapa 1 |
| 3 | Etapa 3 — Menu e telas “Usuários e Acesso” | Etapa 1, 2 |
| 4 | Etapa 4 — Roles como conjuntos de permissões | Etapa 3 (ou em paralelo após 3) |
| 5 | Etapa 5 — Integração Projetos/Tarefas | Etapa 1, 3 |
| 6 | Etapa 6 — Ajustes e documentação | Etapas 1–5 |

---

## Como usar este plano

- Para iniciar: *"Execute a Etapa 1 do plano de usuários e equipes"* (ou o número da etapa desejada).
- Cada etapa será implementada por vez; não avançar para a próxima sem seu comando.
- Referência do plano: `docs/PLANO-USUARIOS-EQUIPES-PERFIS-ACESSO.md`.

**Documentação do modelo implementado (pós Etapa 6):** `docs/MODELO-USUARIOS-EQUIPES-PERFIS-ACESSO.md` — descreve o modelo final (User → Equipes, User → Role, Role → Permissions), tabelas no BD e endpoints da API.
