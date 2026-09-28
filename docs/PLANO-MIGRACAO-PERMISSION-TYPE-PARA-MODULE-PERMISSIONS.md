# Relatório de impacto e plano de migração — permission_type → module permissions

**Objetivo:** Análise final de impacto antes de implementar o Permission Engine baseado em module permissions, e estratégia de transição segura para que `permission_type` / `user_permissions` deixem de ser fonte da verdade.

---

## 1) Onde user_permissions e permission_type ainda são usados (backend)

### 1.1 Leitura

| Arquivo | Uso | Classificação |
|---------|-----|----------------|
| **userPermissionsController.ts** | `getMemberPermissions`: SELECT id, permission, created_at FROM user_permissions WHERE user_id AND profile_id. Retorna lista para o cliente. | **A) Apenas exibição** — usado para mostrar as permissões do membro na UI. |
| **profileMembersController.ts** | `getProfileMembers`: para cada membro, SELECT permission FROM user_permissions WHERE user_id AND profile_id; anexa array `permissions` a cada membro no JSON. | **A) Apenas exibição** — enriquece a lista de membros com as permissões (permission_type) para exibição. |

Nenhum controller lê `user_permissions` ou `permission_type` para **autorizar** uma ação (create/edit/delete/view). A função SQL `has_permission()` existe no banco e **não é chamada** pelo backend Node.

### 1.2 Escrita

| Arquivo | Uso | Classificação |
|---------|-----|----------------|
| **authController.ts** | No registro (criação de conta): INSERT em user_permissions (user_id, profile_id, 'all_access', created_by). | **B) Apenas sincronização com role** — o primeiro usuário recebe role admin e all_access; mantém consistência com o “perfil admin”. |
| **myTenantPlanController.ts** | `postMyTenantUser`: após INSERT em user_roles('member'), INSERT em user_permissions para cada valor de getPermissionsForRole('member'). | **B) Apenas sincronização com role** — espelha o role “member” em user_permissions. |
| **myTenantPlanController.ts** | `putMyTenantUserRole`: ao atribuir role do sistema, DELETE user_permissions WHERE user_id AND profile_id e INSERT para cada getPermissionsForRole(role). | **B) Apenas sincronização com role** — mantém user_permissions alinhado ao role escolhido. |
| **userPermissionsController.ts** | `createMemberPermission`: INSERT em user_permissions (user_id, profile_id, permission, created_by) com permission do body (permission_type). | **A) Exibição + escrita direta** — a UI pode adicionar/remover permissões granulares ao membro; hoje isso **não** altera autorização na API (que usa só module permissions). |
| **userPermissionsController.ts** | `deleteMemberPermission`: DELETE FROM user_permissions WHERE id (após validar que a permissão pertence ao membro e ao perfil do owner). | **A) Exibição** — reflete remoção de permissão na lista; não impacta assertModulePermission. |
| **profileMembersController.ts** | `deleteProfileMember`: DELETE FROM user_permissions WHERE user_id AND profile_id do membro, antes de DELETE em profile_members. | **B) Limpeza ao remover membro** — evita linhas órfãs; não é decisão de autorização. |

### 1.3 Outras referências (não leitura/escrita de decisão)

| Arquivo | Uso | Classificação |
|---------|-----|----------------|
| **utils/tenantSecurity.ts** | Lista `user_permissions` em TENANT_SCOPED_TABLES para assertTenantScopedQuery (detecção de SELECT em tabela tenant-scoped). | Não é uso de permissão; só nome da tabela para checagem de segurança. |
| **migrate.ts** | Inclusão do script 03_create_permissions_and_roles.sql (cria user_roles e user_permissions). | Infraestrutura de migração. |

### 1.4 Resumo da classificação

- **A) Apenas exibição:** getMemberPermissions, getProfileMembers (campo permissions), createMemberPermission, deleteMemberPermission — servem à UI que lista/edita permissões do membro.
- **B) Apenas sincronização com role:** authController (registro), postMyTenantUser, putMyTenantUserRole, deleteProfileMember (limpeza).
- **C) Usado para autorização:** **nenhum** — a API não consulta user_permissions para permitir ou negar acesso.

---

## 2) Dependências na UI

### 2.1 Telas / fluxos que usam permission_type ou user_permissions

| Tela / fluxo | Fonte dos dados | Observação |
|--------------|-----------------|------------|
| **Configurações → Perfis de acesso (UserManagementSection)** | GET /api/me/tenant/roles (getMyTenantRoles). Para cada role do sistema, o backend retorna `permissions: getPermissionsForRole(row.role)` — array de **permission_type** (manage_clients, view_clients, etc.). A UI exibe esses valores com PERMISSION_LABELS (Gerenciar Clientes, Visualizar Clientes...). | Depende de **permission_type** apenas para **exibição** na card do perfil. A edição de permissões usa **RolePermissionsDialog** → API de **module permissions** (/api/me/tenant/roles/:role/permissions e custom-roles/:id/permissions). |
| **Gerenciamento de membros do perfil (user_profiles)** | SettingsService: getProfileMembers(profileId) → GET /api/user-profiles/:profileId/members. Resposta inclui `permissions: string[]` por membro (vindo de user_permissions no backend). getMemberPermissions(memberId), createMemberPermission, deleteMemberPermission → rotas em /api/user-profiles/members/:memberId/permissions. | **settings.ts** expõe os métodos; não foi encontrado componente que chame getProfileMembers ou getMemberPermissions na árvore atual. Se existir tela “Membros do perfil” (user_profiles), ela dependeria dessas APIs e do formato permission_type. |
| **auth-helpers.checkPermission(profileId, permission)** | GET `/api/user-profiles/${profileId}/permissions/${permission}`. | Esse endpoint **não existe** no backend atual (existem apenas .../members/:memberId/permissions). A chamada pode falhar ou estar obsoleta; ver “Possíveis quebras”. |

### 2.2 Telas que já usam module permissions

| Tela / fluxo | API | Observação |
|--------------|-----|------------|
| **Configurações → Perfis de acesso → Editar permissões** | GET/PUT /api/me/tenant/roles/:role/permissions e /api/me/tenant/custom-roles/:id/permissions (modulePermissionsService). | Fonte da verdade para “o que o perfil pode fazer” já é module permissions. |
| **Meu plano / Usuários** | GET /api/me/tenant/users (role e custom_role_name por usuário). Atribuição de perfil: PUT /api/me/tenant/users/:userId/role (role ou custom_role_id). | Atribuição é por role/custom role; não por lista de permission_type. |
| **ModulePermissionsContext** | GET /api/me/tenant/my-permissions (getEffectiveModulePermissions). | UI usa permissões por módulo para habilitar/ocultar ações. |

### 2.3 Resumo de dependências

- **Exibição de “permissões do perfil” na card (Perfis de acesso):** usa permission_type (getPermissionsForRole) apenas para rótulos; a configuração efetiva já é por módulo.
- **Membros do perfil (user_profiles):** backend e frontend (settings.ts) prontos para listar/editar user_permissions; uso em tela não confirmado na busca.
- **checkPermission (auth-helpers):** depende de um endpoint que não existe no backend atual.

---

## 3) Possíveis quebras

### 3.1 Se permission_type deixar de ser fonte da verdade (sem migração)

| Cenário | Risco | Impacto |
|---------|--------|---------|
| **GET /api/me/tenant/roles** deixar de retornar `permissions: getPermissionsForRole(role)` | UI “Perfis de acesso” deixa de mostrar os badges (Gerenciar Clientes, etc.) para roles do sistema. | **Médio** — apenas visual; a edição já é por módulo. Mitigação: derivar lista de “labels” a partir de role_module_permissions (equivalência view_X / manage_X) ou manter getPermissionsForRole só para exibição. |
| **GET /api/user-profiles/:profileId/members** deixar de preencher `permissions` a partir de user_permissions | Qualquer tela que liste membros do perfil e mostre permissões veria array vazio ou precisaria de novo formato. | **Baixo** se nenhuma tela usar; **médio** se existir tela “Membros do perfil” que dependa disso. |
| **POST/DELETE .../members/:memberId/permissions** deixarem de escrever em user_permissions | Usuário “adiciona permissão” ao membro e a lista não persiste ou não reflete em nenhum lugar que a API use para autorização. | **Baixo** para autorização (API já não usa); **médio** para consistência da UI que edita permissões do membro. |
| **Registro e postMyTenantUser / putMyTenantUserRole** deixarem de escrever em user_permissions | Menos linhas em user_permissions; funções SQL has_permission() passariam a retornar false para esses usuários (se alguém as usar no futuro). RLS e lógica da API não dependem de user_permissions. | **Baixo** — desde que a autorização continue baseada em user_roles + role_module_permissions (e custom). |
| **auth-helpers.checkPermission(profileId, permission)** | Continua chamando GET .../permissions/:permission inexistente; pode retornar erro ou 404. | **Baixo** se a função não for usada; **médio** se alguma tela depender dela para exibir/ocultar algo. |

### 3.2 Quebras evitáveis com a estratégia em fases

- **Fase 1:** Manter escrita/leitura em user_permissions, mas **derivar** o conteúdo a partir de module permissions (ou de role + getPermissionsForRole), de forma que “fonte da verdade” seja só a de módulos; evita quebra de exibição.
- **Fase 2:** Migrar a UI para consumir apenas APIs de módulo (lista de permissões do membro = effective module permissions); depois, remover ou depreciar endpoints que devolvem permission_type.
- **Fase 3:** Remover ou manter user_permissions apenas como cache/legado; documentar que autorização é somente por module permissions.

---

## 4) Estratégia de transição em três fases

### FASE 1 — permission_type como derivado de module permissions

**Objetivo:** Fonte da verdade passa a ser apenas module permissions (role_module_permissions / custom_role_module_permissions + user_roles / user_custom_roles). user_permissions continua existindo e sendo preenchido para não quebrar UIs que ainda dependem dele.

**Backend:**

1. **Definir regra de derivação:** Para um (user_id, profile_id), as “permissões efetivas” vêm de getEffectiveModulePermissions(userId). Criar função (ou mapa) que converte ModulePermissionsMap → lista de permission_type (ex.: clients.can_view → view_clients; clients.can_create/can_edit/can_delete → manage_clients; mesmo padrão para leads, funnels; settings → manage_settings; dashboard.can_view → view_reports se desejado; manage_users pode ficar “só admin” ou mapear de um módulo futuro).
2. **Leitura “derivada” onde hoje se lê user_permissions para exibição:**
   - **getMemberPermissions:** em vez de SELECT em user_permissions, obter (user_id, profile_id) do membro, chamar getEffectiveModulePermissions(member.user_id) e converter o resultado para lista de permission_type (e opcionalmente para formato { id, permission, created_at } com ids sintéticos ou mantendo apenas permission).
   - **getProfileMembers:** para cada membro, em vez de SELECT em user_permissions, usar getEffectiveModulePermissions(member.user_id) e converter para permissions: string[] (permission_type). Cuidado com performance (N+1); considerar cache ou batch.
3. **Escrita “espelhada”:** Manter INSERT/DELETE em user_permissions nos fluxos atuais (registro, postMyTenantUser, putMyTenantUserRole, deleteProfileMember) para que dados antigos e UIs que escrevem continuem funcionando. Opcional: ao criar/atualizar role ou custom role, (re)calcular a lista permission_type equivalente e fazer REPLACE (DELETE + INSERT) em user_permissions para esse (user_id, profile_id), para que leitura derivada e leitura direta da tabela coincidam.
4. **createMemberPermission / deleteMemberPermission:** Decisão de produto: (a) **Depreciar:** retornar 410 ou 400 com mensagem “Use Perfis de acesso para definir permissões por módulo”; ou (b) **Manter por compatibilidade:** continuar escrevendo em user_permissions, mas documentar que a autorização da API ignora isso e usa só module permissions; na Fase 2 a UI deixa de chamar esses endpoints.

**Resultado da Fase 1:** Quem lê “permissões do membro” ou “permissões do perfil” passa a ver valores consistentes com o que a API realmente usa (module permissions). Não é necessário mudar a UI de imediato. user_permissions pode continuar sendo escrito para compatibilidade.

---

### FASE 2 — UI passa a usar módulo diretamente

**Objetivo:** Telas que hoje mostram ou editam “permissões” passam a usar apenas o modelo por módulo (can_view, can_create, can_edit, can_delete por módulo).

**Frontend:**

1. **Perfis de acesso (lista de roles):** Em vez de exibir `permissions: getPermissionsForRole(role)` (permission_type), exibir resumo derivado de GET /api/me/tenant/roles/:role/permissions (já existe) — ex.: “Clientes: ver, criar, editar, excluir”; “Leads: ver, criar…” ou ícones. Opcionalmente manter um texto curto “Permissões por módulo” e remover os badges manage_clients, view_clients, etc.
2. **Membros do perfil (se existir tela):** Trocar lista de permission_type por:
   - Mostrar “Perfil de acesso” do usuário (role ou custom role name) — vindo de /api/me/tenant/users se o membro for usuário do tenant, ou novo endpoint que retorne effective role + effective module permissions para o (user_id, profile_id).
   - Ou exibir “Permissões por módulo” (can_view, can_create, can_edit, can_delete por módulo) em vez de checkboxes manage_clients, view_clients, etc. Endpoint sugerido: GET /api/user-profiles/members/:memberId/effective-permissions (retorna ModulePermissionsMap) implementado no backend a partir de getEffectiveModulePermissions(member.user_id).
3. **Edição de permissões do membro:** Em vez de adicionar/remover permission_type (createMemberPermission / deleteMemberPermission), passar a alterar o **perfil de acesso** do usuário (role ou custom_role_id) via fluxo já existente em “Meu plano → Usuários” (PUT /api/me/tenant/users/:userId/role). Se o contexto for “perfil (user_profile)” e não “tenant”, pode ser necessário um endpoint que atribua role/custom_role ao par (user_id, profile_id) no contexto daquele profile; hoje isso já existe para o tenant (putMyTenantUserRole). Avaliar se “membros do perfil” e “usuários do tenant” são o mesmo conjunto; se forem, a UI de membros pode apenas redirecionar ou reutilizar o fluxo de “alterar perfil do usuário”.
4. **auth-helpers.checkPermission:** Substituir por verificação baseada em module permissions: ex. GET /api/me/tenant/my-permissions e checar permissions[moduleId].can_view / can_create etc., ou novo endpoint GET /api/me/tenant/check-permission?module=X&action=view (ou similar).

**Backend (suporte à Fase 2):**

- Novo endpoint (se fizer sentido): GET /api/user-profiles/members/:memberId/effective-permissions que retorne getEffectiveModulePermissions(member.user_id) no formato ModulePermissionsMap, para a UI exibir/editar por módulo.
- Decidir destino de createMemberPermission / deleteMemberPermission: depreciar (Fase 2) ou manter só leitura derivada e desativar escrita (Fase 1 já com escrita desativada para novos fluxos).

**Resultado da Fase 2:** Nenhuma tela depende mais de permission_type para exibição ou edição; tudo usa “módulo + ações”. Endpoints que retornam ou aceitam permission_type podem ser marcados como obsoletos ou removidos.

---

### FASE 3 — permission_type removido ou só compatibilidade

**Objetivo:** Eliminar duplicidade e risco de confusão; autorização e dados exibidos vêm apenas de module permissions.

**Opção A — Remoção:**

- Remover coluna/tabela user_permissions (ou deixar apenas em migração de rollback) e enum permission_type (ou mantê-lo só em migrações antigas).
- Remover getPermissionsForRole e ROLE_DEFAULT_PERMISSIONS de rolePermissionsService (ou manter só para exibição legada se necessário).
- Remover endpoints GET/POST/DELETE .../members/:memberId/permissions; GET /api/user-profiles/:profileId/members pode deixar de incluir `permissions` ou incluir apenas um resumo por módulo (ex.: listagem de “módulos com acesso”).
- Remover funções SQL has_permission (ou documentar como legado e não usadas pela aplicação).
- Ajustar registro e postMyTenantUser / putMyTenantUserRole para não escrever em user_permissions.

**Opção B — Manter apenas como compatibilidade:**

- Manter user_permissions e permission_type para integrações ou relatórios que ainda leiam essa tabela; a aplicação não escreve mais nela (exceto job de migração única que preencha a partir de module permissions, se necessário).
- Documentar claramente: “Autorização e configuração de acesso são baseadas apenas em role_module_permissions e custom_role_module_permissions; user_permissions é legado.”

**Recomendação:** Opção A se não houver consumidores externos de user_permissions; Opção B se houver relatórios/Supabase/outros que ainda dependam da tabela.

---

## 5) Resumo do plano

| Fase | Objetivo | Principais ações |
|------|----------|-------------------|
| **Fase 1** | permission_type vira apenas derivado de module permissions | Backend: leitura de “permissões do membro” derivada de getEffectiveModulePermissions + mapa para permission_type; manter escrita em user_permissions onde já existe (ou espelhamento a partir de role). |
| **Fase 2** | UI passa a usar módulo diretamente | Frontend: exibir e editar permissões por módulo (can_view/can_create/can_edit/can_delete); substituir checkPermission por checagem por módulo; backend: endpoint effective-permissions por membro (se necessário). |
| **Fase 3** | permission_type removido ou só compatibilidade | Remover (ou desativar escrita em) user_permissions e endpoints/uso de permission_type na aplicação; manter apenas module permissions como fonte da verdade. |

Ordem sugerida: implementar Fase 1 (derivação no backend) primeiro, validar que listagens e exibição continuam corretas; em seguida Fase 2 (mudança da UI e dos fluxos de edição); por fim Fase 3 (limpeza ou legado documentado). Não implementar nada além do que está neste plano até que as fases sejam aprovadas e priorizadas.
