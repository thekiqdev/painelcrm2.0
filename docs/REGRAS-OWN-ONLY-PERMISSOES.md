# Regras globais para edit_own_only e delete_own_only

**Objetivo:** Definir de forma consistente qual campo determina "own" (próprio registro) em cada módulo que suporta `edit_own_only` e `delete_own_only`, para uso no Permission Engine.

---

## 1) Conceitos

| Conceito | Descrição | Uso em *_own_only |
|----------|-----------|--------------------|
| **Owner (dono)** | Quem criou o registro ou é o responsável principal. Em todas as tabelas listadas é a coluna **user_id**. | Usuário pode editar/excluir se for o **owner**. |
| **Assignee (atribuído)** | Quem está atribuído para executar/trabalhar no registro (quando o recurso tem essa noção). | Usuário pode editar/excluir se for o **assignee** (além do owner). |
| **Responsible** | Em contratos, "responsável" pelo contrato (responsible_id). Tratado como **assignee** para consistência. | Mesma regra que assignee. |

**Regra única do sistema:**  
Para `edit_own_only` ou `delete_own_only`, o usuário está autorizado se **pelo menos uma** das condições for verdadeira:

- `current_user_id === owner_id` (owner_id = valor da coluna que define o dono do registro)
- `current_user_id === assignee_id` (assignee_id = valor da coluna que define o responsável atribuído, quando existir)

Não se usa "project_member" ou "team_member" para definir "own" em edit_own/delete_own: participação em projeto/equipe é usada para **visibilidade** (quem vê o quê), não para "este registro é meu para editar/excluir". O "own" é sempre **dono do registro** (user_id) e, quando aplicável, **atribuído** (assignee_id / responsible_id).

---

## 2) Campo "owner" por módulo

Em **todos** os módulos abaixo o dono do registro é a coluna **user_id** da tabela principal do recurso.

| Módulo | Tabela principal | Coluna owner | Observação |
|--------|-------------------|--------------|------------|
| **clients** | `clients` | `user_id` | Dono do cliente (quem criou). |
| **leads** | `leads` | `user_id` | Dono do lead. |
| **projects** | `projects` | `user_id` | Dono do projeto (criador). |
| **tasks** | `project_tasks` (e `tasks` se aplicável) | `user_id` | Criador da tarefa. |
| **tickets** | `tickets` | `user_id` | Criador do ticket. |
| **contracts** | `contracts` | `user_id` | Dono do contrato (quem criou). |
| **proposals** | `proposals` | `user_id` | Dono da proposta. |
| **products** | `products` | `user_id` | Dono do produto (quem criou). |

**Padrão:** Sempre **user_id** na tabela do recurso. Não usar `created_by` em tabelas que tenham tanto `user_id` quanto `created_by`: preferir **user_id** como owner (é o que existe hoje nas tabelas listadas; `created_by` aparece em contract_events, não no contrato em si).

---

## 3) Campo "assignee" (ou equivalente) por módulo

Só entra na regra de *_own_only quando o módulo tiver noção de "quem está atribuído" ao registro.

| Módulo | Tabela | Coluna assignee | Observação |
|--------|--------|------------------|------------|
| **clients** | `clients` | — | Não existe; só owner. |
| **leads** | `leads` | — | Não existe; só owner. |
| **projects** | `projects` | — | Não existe coluna única "assignee" no projeto; responsible_ids/team_ids são para visibilidade/áreas, não para "own" de um registro. **Só owner.** |
| **tasks** | `project_tasks` | `assignee_id` | Responsável pela tarefa; conta para edit_own/delete_own. |
| **tasks** (tarefas gerais) | `tasks` | `assignee_id` | Idem. |
| **tickets** | `tickets` | `assignee_id` | Atendente atribuído; conta para edit_own/delete_own. |
| **contracts** | `contracts` | `responsible_id` | Responsável pelo contrato; tratar como **assignee** na regra. |
| **proposals** | `proposals` | — | Não existe; só owner. |
| **products** | `products` | `responsible_id` | Responsável pelo produto (quem gerencia); tratar como **assignee** na regra. |

---

## 4) Resumo por módulo (para assertModulePermission)

| Módulo | ownerId (fonte) | assigneeId (fonte) | Observação |
|--------|------------------|---------------------|------------|
| **clients** | `client.user_id` | — | Só owner. |
| **leads** | `lead.user_id` | — | Só owner. |
| **projects** | `project.user_id` | — | Só owner. |
| **tasks** (project_tasks) | `project_task.user_id` | `project_task.assignee_id` | Owner + assignee. |
| **tasks** (tarefas gerais) | `task.user_id` | `task.assignee_id` | Owner + assignee. |
| **tickets** | `ticket.user_id` | `ticket.assignee_id` | Owner + assignee. |
| **contracts** | `contract.user_id` | `contract.responsible_id` | Owner + responsible (como assignee). |
| **proposals** | `proposal.user_id` | — | Só owner. |
| **products** | `product.user_id` | `product.responsible_id` | Owner + responsible (como assignee). |

---

## 5) Padrão consistente para todo o sistema

### 5.1 Nomenclatura no código

- **ownerId:** sempre o `user_id` do registro (quem criou / dono).
- **assigneeId:** quando existir, o id do usuário atribuído ao registro:
  - Coluna `assignee_id` em tasks, project_tasks, tickets.
  - Coluna `responsible_id` em contracts e products (mapear para assigneeId no options).

Assim, a interface `AssertModulePermissionOptions` permanece:

- `ownerId?: string | null` — user_id do recurso.
- `assigneeId?: string | null` — assignee_id ou responsible_id do recurso.

### 5.2 Regra de decisão (já implementada em modulePermissionsService)

Para `edit_own_only` ou `delete_own_only`:

- Permitir se `userId === ownerId` **ou** `userId === assigneeId` (quando informado).
- Caso contrário, negar (403).

Não considerar para "own":

- `created_by` (usar user_id como owner).
- Ser membro do projeto ou da equipe (isso é visibilidade, não "own" do registro).
- Outras colunas que não sejam o dono ou o atribuído direto do registro.

### 5.3 Módulos que suportam assignee (para documentação e UI)

- **tasks** (project_tasks e tasks): owner = user_id, assignee = assignee_id.
- **tickets**: owner = user_id, assignee = assignee_id.
- **contracts**: owner = user_id, assignee = responsible_id (mapeado como assigneeId).
- **products**: owner = user_id, assignee = responsible_id (mapeado como assigneeId).

Os demais (clients, leads, proposals) usam apenas **owner** (user_id). projects não tem coluna assignee; só owner.

---

## 6) Uso nos controllers (checklist)

Ao chamar `assertModulePermission(userId, moduleId, 'edit' | 'delete', options)` para um recurso específico:

1. Carregar o registro (ou ao menos owner/assignee).
2. Preencher `ownerId` com o **user_id** do registro (sempre).
3. Se o módulo tiver coluna de atribuído, preencher `assigneeId`:
   - **tasks:** assignee_id
   - **tickets:** assignee_id
   - **contracts:** responsible_id (passar como assigneeId)
   - **products:** responsible_id (passar como assigneeId)

**Estado atual no código:**

- **clients, leads, projects:** já passam `ownerId: row.user_id`; não há assignee. ✅
- **project_tasks (tasks):** já passam `ownerId: task.user_id` e `assigneeId: task.assignee_id`. ✅
- **tickets, contracts, proposals, products:** quando integrados ao Permission Engine, usar a tabela acima (owner = user_id; assignee = assignee_id ou responsible_id conforme o módulo).

---

## 7) Tabela de referência rápida

| Módulo    | Tabela          | Campo "own" (owner) | Campo assignee (se houver) |
|-----------|-----------------|----------------------|----------------------------|
| clients   | clients         | user_id              | —                          |
| leads     | leads           | user_id              | —                          |
| projects  | projects        | user_id              | —                          |
| tasks     | project_tasks   | user_id              | assignee_id                |
| tasks     | tasks           | user_id              | assignee_id                |
| tickets   | tickets         | user_id              | assignee_id                |
| contracts | contracts       | user_id              | responsible_id             |
| proposals | proposals       | user_id              | —                          |
| products  | products        | user_id              | responsible_id             |

**Padrão global:** owner = **user_id**; assignee = **assignee_id** ou **responsible_id** (apenas onde existir). Nenhum módulo usa `created_by` nem "project_member" como critério de "own" para edit_own_only/delete_own_only.
