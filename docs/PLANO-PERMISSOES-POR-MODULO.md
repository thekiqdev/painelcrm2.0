# Plano: Permissões por Módulo e Perfis de Acesso (Roles)

Objetivo: permitir que o admin defina perfis de acesso por **módulo do sistema**, com permissões granulares (visualizar, editar, criar, excluir) e, quando aplicável, a opção **somente editar/excluir o que o próprio usuário criou**. Remover as abas "Perfis e membros" e "Usuários" da tela de Perfis de acesso; manter apenas **Administrador** e **Operacional** como perfis padrão.

---

## Resumo das mudanças na UI

| O que | Ação |
|-------|------|
| Tela **Perfis de acesso** (Configurações) | Remover abas "Perfis e membros" e "Usuários". Fica só a gestão de **perfis (roles)** e suas permissões por módulo. |
| Usuários | Continuam na seção **Usuários** do menu "Usuários e Acesso" (já existe). |
| Equipes | Continuam na seção **Equipes** (já existe). |
| Perfis padrão | Apenas **Administrador** e **Operacional** criados por padrão. |

---

## Modelo de permissões por módulo

Para cada **módulo** do sistema, o perfil pode ter:

| Permissão | Descrição |
|-----------|-----------|
| **Visualizar** | Ver listagens, detalhes e relatórios do módulo. |
| **Criar** | Criar novos registros (ex.: nova tarefa, novo cliente). |
| **Editar** | Alterar registros existentes. |
| **Excluir** | Remover registros. |

Quando fizer sentido (ex.: Tarefas, Propostas, Tickets), o admin poderá marcar:

| Opção | Descrição |
|-------|-----------|
| **Editar somente os próprios** | Pode editar apenas itens que ele mesmo criou (ou foi atribuído como responsável, conforme regra do módulo). |
| **Excluir somente os próprios** | Pode excluir apenas itens que ele mesmo criou (ou foi atribuído como responsável). |

Se **Editar** ou **Excluir** forem concedidos sem essa restrição, o usuário pode editar/excluir qualquer registro do módulo (dentro do tenant).

---

## Módulos do sistema e permissões

Lista dos módulos (áreas do site) e das permissões que cada um terá na configuração do perfil.

| # | Módulo | Rota / contexto | Visualizar | Criar | Editar | Excluir | Editar só próprios | Excluir só próprios |
|---|--------|------------------|------------|-------|--------|---------|--------------------|----------------------|
| 1 | **Dashboard** | `/dashboard` | ✓ | — | — | — | — | — |
| 2 | **Clientes** | `/clients` | ✓ | ✓ | ✓ | ✓ | Opcional | Opcional |
| 3 | **Leads** | `/leads` | ✓ | ✓ | ✓ | ✓ | Opcional | Opcional |
| 4 | **Funil de Vendas** | `/funnel` | ✓ | ✓ | ✓ | ✓ | — | — |
| 5 | **Produtos** | `/products` | ✓ | ✓ | ✓ | ✓ | Opcional | Opcional |
| 6 | **Projetos** | `/projects` | ✓ | ✓ | ✓ | ✓ | Opcional | Opcional |
| 7 | **Tarefas** | Dentro de projetos | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 8 | **Templates de projeto** | `/project-templates` | ✓ | ✓ | ✓ | ✓ | Opcional | Opcional |
| 9 | **Chat** | `/chat` | ✓ | Uso do chat | — | — | — | — |
| 10 | **Tickets** | `/support/tickets` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 11 | **Propostas** | `/proposals` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 12 | **Contratos** | `/contracts` | ✓ | ✓ | ✓ | ✓ | Opcional | Opcional |
| 13 | **Faturamento** | `/billing` | ✓ | ✓ | ✓ | ✓ | — | — |
| 14 | **Financeiro (Despesas)** | `/finance` | ✓ | ✓ | ✓ | ✓ | — | — |
| 15 | **Configurações** | `/settings` | ✓ | — | ✓ | — | — | — |
| 16 | **Meu Plano** | `/meu-plano` | ✓ | — | — | — | — | — |

- **Opcional**: o sistema suporta a opção "só próprios" para esse módulo; o admin pode ou não marcar.
- **—**: não se aplica (ex.: Dashboard só tem visualização; Meu Plano só leitura).

---

## Perfis padrão

| Perfil | Descrição | Comportamento |
|--------|-----------|---------------|
| **Administrador** | Acesso total ao tenant. | Todos os módulos: visualizar, criar, editar, excluir; sem restrição "só próprios". Inclui Configurações e gestão de usuários/equipes/perfis. |
| **Operacional** | Uso operacional do dia a dia. | Conjunto padrão de módulos com permissões de visualizar + criar + editar (e onde fizer sentido, "editar/excluir só próprios"). Sem acesso a Configurações sensíveis (ex.: perfis, usuários) ou Meu Plano, conforme definido na Etapa 2. |

Não haverá, por padrão, os perfis "Gestor" e "Visualizador". Eles poderão ser recriados pelo admin como perfis customizados, se o sistema permitir criar novos roles (etapa futura).

---

## Etapas do plano

Cada etapa é executada **somente quando você solicitar** (ex.: "execute a Etapa 1 do plano de permissões por módulo"). Não implementar etapas adiante até que seja pedido.

---

### Etapa 1 — Ajustes na tela Perfis de acesso e perfis padrão

**Objetivo:** Simplificar a tela de Perfis de acesso (remover abas) e deixar apenas Administrador e Operacional como perfis padrão.

**Escopo:**

1. **Frontend — UserManagementSection**
   - Remover as abas **"Perfis e membros"** e **"Usuários"**.
   - Manter apenas o conteúdo da aba **"Perfis de acesso"**: lista de perfis (roles) com suas permissões.
   - Ajustar texto da descrição do card (remover menção a "perfis e membros por workspace").
   - Usuários continuam sendo gerenciados na seção **Usuários** do menu; Equipes na seção **Equipes**.

2. **Backend / BD**
   - Garantir que os únicos roles exibidos/criados por padrão sejam **admin** (Administrador) e **member** (Operacional).
   - Remover ou não exibir **manager** (Gestor) e **viewer** (Visualizador) como padrão: ou excluir do seed/enum, ou manter no enum mas não criar registros padrão e não listar na UI até uma etapa futura de "criar perfil customizado".
   - Documentar no modelo: "Perfis padrão: Administrador e Operacional."

3. **Documentação**
   - Atualizar `docs/MODELO-USUARIOS-EQUIPES-PERFIS-ACESSO.md` com: remoção das abas; perfis padrão apenas Administrador e Operacional.

**Entregável:** Tela "Perfis de acesso" só com lista de perfis e permissões; sem abas Perfis e membros / Usuários; apenas dois perfis padrão (Administrador e Operacional).

**Comando sugerido:** *"Execute a Etapa 1 do plano de permissões por módulo"*

---

### Etapa 2 — Modelo de dados: permissões por módulo (backend/BD)

**Objetivo:** Definir no backend e no BD o modelo de permissões **por módulo** (visualizar, criar, editar, excluir + “só próprios” quando aplicável).

**Escopo:**

1. **Backend / BD**
   - Definir lista de **módulos** (ex.: `dashboard`, `clients`, `leads`, `funnels`, `products`, `projects`, `tasks`, `project_templates`, `chat`, `tickets`, `proposals`, `contracts`, `billing`, `finance`, `settings`, `meu_plano`).
   - Para cada módulo, definir **ações**: `view`, `create`, `edit`, `delete`; e, para módulos que suportam, `edit_own`, `delete_own` (ou um único flag `restrict_to_own` para editar/excluir).
   - Opção A: estender o enum `permission_type` com valores granulares (ex.: `clients_view`, `clients_create`, `clients_edit`, `clients_delete`, `clients_edit_own`, `clients_delete_own`) e manter role → conjunto de permission_type.
   - Opção B: nova tabela `module_permissions` (role_id ou role slug, module_id, view, create, edit, delete, edit_own, delete_own) e migração; roles continuam em `app_role` ou tabela `roles`.
   - Escolher uma abordagem (recomenda-se Opção B para flexibilidade e UI de matriz módulo × permissão).
   - Criar migração SQL; garantir que os perfis padrão (admin, member) tenham os conjuntos corretos (admin = tudo; member = conforme matriz da Etapa 2).

2. **Backend (API)**
   - Endpoint para listar módulos e permissões possíveis (ex.: `GET /api/me/tenant/module-permissions-schema`).
   - Endpoint para obter/atualizar permissões de um perfil (ex.: `GET /api/me/tenant/roles/:role/permissions`, `PUT /api/me/tenant/roles/:role/permissions`) — apenas para admin do tenant.
   - Serviço que, dado `user_id` + `profile_id`, retorna as permissões efetivas por módulo (para uso em guards no front e em middlewares no backend).

**Entregável:** Modelo de dados e API para permissões por módulo; migração aplicada; perfis Administrador e Operacional com permissões iniciais definidas.

**Comando sugerido:** *"Execute a Etapa 2 do plano de permissões por módulo"*

---

### Etapa 3 — UI: admin define permissões por módulo no perfil

**Objetivo:** Na tela Perfis de acesso, o admin poder editar um perfil e configurar, por módulo, visualizar / criar / editar / excluir e (quando aplicável) editar só próprios / excluir só próprios.

**Escopo:**

1. **Frontend**
   - Na seção Perfis de acesso, ao clicar em um perfil (ex.: Operacional), abrir um painel ou modal com uma **matriz**: linhas = módulos, colunas = Visualizar | Criar | Editar | Excluir | Editar só próprios | Excluir só próprios (últimas duas apenas para módulos que suportam).
   - Checkboxes ou toggles por célula; "Editar só próprios" e "Excluir só próprios" desabilitados ou ocultos quando "Editar"/"Excluir" estiverem desmarcados ou quando o módulo não suportar.
   - Perfil **Administrador** pode ser exibido como somente leitura (sempre tudo marcado) ou editável; salvar via `PUT .../roles/admin/permissions`.
   - Chamar `GET/PUT` da API de permissões por módulo; tratar loading e erros.

2. **Acessibilidade e textos**
   - Labels claros por módulo (ex.: "Clientes", "Tarefas", "Propostas"); descrição curta opcional para "Editar só próprios" / "Excluir só próprios".

**Entregável:** Interface em que o admin configura, por perfil, as permissões de cada módulo, incluindo opções "só próprios" onde previsto.

**Comando sugerido:** *"Execute a Etapa 3 do plano de permissões por módulo"*

---

### Etapa 4 — Aplicar permissões no frontend (rotas e ações)

**Objetivo:** Ocultar ou desabilitar no frontend módulos e ações conforme as permissões do usuário logado.

**Escopo:**

1. **Frontend**
   - Obter permissões por módulo do usuário (via contexto ou hook, alimentado por `GET /api/me/permissions` ou equivalente que retorne a matriz módulo → ações).
   - **Menu (sidebar):** exibir apenas itens de módulos para os quais o usuário tem pelo menos `view`.
   - **Por página:** esconder ou desabilitar botões "Criar", "Editar", "Excluir" conforme `create`, `edit`, `delete`; em listagens, esconder ações por registro (ex.: editar/excluir) quando for "só próprios" e o registro não for do usuário.
   - **Tarefas (exemplo):** se o perfil tiver "Excluir somente os próprios", o botão excluir só aparece para tarefas criadas/atribuídas ao usuário; caso contrário, respeitar `delete` geral.
   - Ordem sugerida de implementação: Dashboard → Clientes → Leads → Funis → Produtos → Projetos → Tarefas → Templates → Chat → Tickets → Propostas → Contratos → Faturamento → Financeiro → Configurações → Meu Plano.

2. **Consistência**
   - Garantir que rotas sem permissão redirecionem para dashboard ou exibam "Sem permissão" (página ou toast).

**Entregável:** Menu e ações por módulo respeitando as permissões do perfil; experiência consistente em todas as áreas listadas.

**Comando sugerido:** *"Execute a Etapa 4 do plano de permissões por módulo"*

---

### Etapa 5 — Aplicar permissões no backend (APIs)

**Objetivo:** Garantir que as APIs rejeitem operações não permitidas pelo perfil (create/edit/delete e restrição "só próprios").

**Escopo:**

1. **Backend**
   - Em cada controller relevante (clientes, leads, funis, projetos, tarefas, propostas, tickets, etc.), antes de criar/editar/excluir:
     - Verificar se o usuário tem permissão de `create` / `edit` / `delete` para aquele módulo.
     - Se a permissão for "só próprios", verificar se o recurso pertence ao usuário (ex.: `created_by = user.id` ou `assigned_to = user.id`, conforme regra do módulo).
   - Retornar 403 com mensagem clara quando a ação não for permitida.
   - Endpoints de listagem: filtrar resultados quando a política for "só próprios" (ex.: tarefas — se `edit_own`/`delete_own`, listar apenas as que pode editar/excluir ou todas para visualização, mas bloquear na alteração).

2. **Documentação**
   - Listar em `docs/MODELO-USUARIOS-EQUIPES-PERFIS-ACESSO.md` (ou em novo doc) os módulos e as regras de "só próprios" (campo de ownership usado em cada um).

**Entregável:** APIs protegidas por permissão por módulo e por regra "só próprios"; respostas 403 quando aplicável.

**Comando sugerido:** *"Execute a Etapa 5 do plano de permissões por módulo"*

---

### Etapa 6 — Ajustes finais e documentação

**Objetivo:** Revisar fluxos, mensagens e documentação.

**Escopo:**

- Revisar todos os textos da tela Perfis de acesso e da matriz de permissões (tooltips, labels, mensagens de "sem permissão").
- Garantir que novo tenant ou instalação tenha apenas os perfis Administrador e Operacional com as permissões padrão definidas.
- Atualizar `docs/MODELO-USUARIOS-EQUIPES-PERFIS-ACESSO.md` e este plano com o modelo final (módulos, ações, "só próprios", perfis padrão).
- Testes manuais: admin altera permissões do Operacional; login como operacional e verificar menu e ações; tentativa de ação não permitida (front e API).

**Entregável:** Documentação atualizada; experiência e segurança validadas.

**Comando sugerido:** *"Execute a Etapa 6 do plano de permissões por módulo"*

---

## Ordem e dependências

| Ordem | Etapa | Depende de |
|-------|--------|------------|
| 1 | Etapa 1 — Ajustes na tela e perfis padrão | — |
| 2 | Etapa 2 — Modelo de dados (permissões por módulo) | — (pode ser em paralelo com 1) |
| 3 | Etapa 3 — UI admin define permissões por módulo | Etapa 2 |
| 4 | Etapa 4 — Aplicar permissões no frontend | Etapa 2 |
| 5 | Etapa 5 — Aplicar permissões no backend | Etapa 2 |
| 6 | Etapa 6 — Ajustes e documentação | Etapas 1–5 |

---

## Modelo final (pós Etapa 6)

- **Perfis padrão:** apenas Administrador e Operacional (admin, member). Seed na migração `51_role_module_permissions.sql`.
- **Permissões por módulo:** tabela `role_module_permissions` (can_view, can_create, can_edit, can_delete, edit_own_only, delete_own_only). API: GET/PUT `/api/me/tenant/roles/:role/permissions`, GET `/api/me/tenant/my-permissions`.
- **Frontend:** menu e rotas filtrados por `canView(moduleId)`; botões Criar/Editar/Excluir por `canCreate`/`canEdit`/`canDelete`; rota sem permissão → redirect para `/dashboard` com toast "Sem permissão para acessar esta área."
- **Backend:** `assertModulePermission(userId, moduleId, action, { ownerId?, assigneeId? })` antes de create/update/delete; 403 quando não permitido. Módulos protegidos: clients, leads, projects, tasks (project_tasks). Ownership: ver tabela em `docs/MODELO-USUARIOS-EQUIPES-PERFIS-ACESSO.md` (campo dono/responsável por módulo).

---

## Checklist de validação (testes manuais)

Após implementar as etapas 1–6, validar:

1. **Perfis de acesso (admin)**  
   - [ ] Configurações → Perfis de acesso: aparecem só Administrador e Operacional.  
   - [ ] Clicar em "Editar permissões" (Operacional): abre matriz de módulos; colunas têm títulos e tooltips (Visualizar, Criar, Editar, Excluir, Editar só próprios, Excluir só próprios).  
   - [ ] Alterar alguma permissão do Operacional e salvar: toast "Permissões salvas."

2. **Menu e rota (operacional)**  
   - [ ] Login com usuário que tem perfil Operacional (e permissões restritas, ex.: sem Meu Plano).  
   - [ ] Menu lateral: itens sem permissão de visualização não aparecem (ex.: Meu Plano se configurado sem view).  
   - [ ] Acessar URL de módulo sem permissão (ex.: `/meu-plano`): redireciona para `/dashboard` e exibe toast "Sem permissão para acessar esta área."

3. **Ações na página (operacional)**  
   - [ ] Em Clientes: sem permissão de criar → botão "Novo Cliente" não aparece.  
   - [ ] Sem permissão de editar/excluir → ações "Editar Cliente" / "Excluir Cliente" não aparecem na lista.

4. **API (403)**  
   - [ ] Com usuário operacional, chamar POST `/api/clients` (ou outro create) sem permissão: resposta 403 com mensagem clara.  
   - [ ] Editar/excluir recurso de outro usuário com perfil "só próprios": 403.

5. **Novo tenant / instalação**  
   - [ ] Após rodar migrações (incl. `51_role_module_permissions.sql`), existem apenas registros para roles admin e member em `role_module_permissions`, com valores padrão conforme seed.

---

## Como usar este plano

- Para iniciar: *"Execute a Etapa 1 do plano de permissões por módulo"* (ou o número da etapa desejada).
- Cada etapa será implementada por vez; não avançar para a próxima sem seu comando.
- Referência: `docs/PLANO-PERMISSOES-POR-MODULO.md`.

---

## Resumo do exemplo: Tarefas

- **Visualizar:** ver listagem e detalhes de tarefas (conforme filtros do projeto/equipe).
- **Criar:** criar novas tarefas.
- **Editar:** editar tarefas; se "Editar somente os próprios" estiver marcado, apenas tarefas que o usuário criou ou às quais está atribuído.
- **Excluir:** excluir tarefas; se "Excluir somente os próprios" estiver marcado, apenas as que criou ou está atribuído.

Isso atende ao objetivo de o admin definir, no perfil de acesso, se o perfil X pode visualizar o módulo, editar, criar, remover tarefas e, opcionalmente, restringir edição/exclusão às tarefas próprias.
