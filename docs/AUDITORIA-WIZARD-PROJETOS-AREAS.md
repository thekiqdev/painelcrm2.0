# Auditoria: Wizard de Projetos e Áreas

## 1. Problemas encontrados

| # | Problema | Causa |
|---|----------|--------|
| 1 | **Áreas não exibidas após criação** | Backend não retornava `areas` em `getProjectById`; frontend não pedia nem exibia áreas. |
| 2 | **Não era possível criar/editar/excluir áreas** | Não existiam endpoints nem UI para CRUD de `project_areas` (apenas inserção na criação do projeto). |
| 3 | **Projetos ADVANCED “não permitiam” áreas** | Regra igual à de AREAS (áreas permitidas), mas não havia API nem UI; usuário não via opção de áreas. |
| 4 | **Projetos AREAS “não geravam etapas padrão”** | Backend já criava listas padrão para `simple`, `areas` e `advanced`; possível confusão com cache/early-return no front que não recarregava listas ao abrir o projeto. |
| 5 | **Inconsistência modelo × UI** | Tipo `project_type` não era repassado na lista de projetos nem no detalhe; não havia “resolver” único de features (hasAreas / hasVersions). |
| 6 | **Sem “ProjectFeatureResolver” centralizado** | Regras de “AREAS permite áreas” e “ADVANCED permite áreas e versões” estavam só no backend na criação; frontend e área CRUD não tinham referência única. |

---

## 2. Correções aplicadas

### Backend

- **getProjectById**  
  - Incluído retorno de `areas` para projetos com `project_type` `areas` ou `advanced` (consulta em `project_areas`).

- **Novo CRUD de áreas**  
  - **Controller:** `projectAreasController.ts` com regra única `projectAllowsAreas(projectType)` (tipos `areas` e `advanced`).  
  - **Rotas:** `projectAreasRoutes.ts`  
    - `GET /api/projects/:projectId/areas`  
    - `POST /api/projects/:projectId/areas`  
    - `PATCH /api/projects/areas/:areaId`  
    - `DELETE /api/projects/areas/:areaId`  
  - Todas as ações validam que o projeto é do usuário e que `project_type` é `areas` ou `advanced`.

- **Etapas padrão**  
  - Mantido: `createProject` já insere `DEFAULT_LISTS` para `simple`, `areas` e `advanced`. Nenhuma alteração necessária.

### Frontend

- **Tipos e API**  
  - `ProjectArea` e `areas` em tipos (services e components).  
  - Lista de projetos passa a incluir `project_type` na conversão da API.  
  - Detalhe do projeto: chamada a `getProjectById` + `getProjectLists` para preencher `project_type`, `areas` e listas/etapas.

- **Resolver de features**  
  - `src/lib/projectFeatures.ts`: `hasAreas(projectType)` e `hasVersions(projectType)` para uso na UI e alinhamento com o backend.

- **Service de projetos**  
  - `getProjectAreas(projectId)`, `createProjectArea`, `updateProjectArea`, `deleteProjectArea` em `src/services/projects.ts`.

- **UI de áreas**  
  - Componente `ProjectAreasSection`: exibido apenas quando `hasAreas(selectedProject.project_type)`.  
  - Listagem, “Nova área”, edição e exclusão com diálogo e atualização do estado/lista.

- **Remoção de early-return no carregamento do detalhe**  
  - Ao abrir um projeto, sempre são carregados `getProjectById` e listas (e tarefas), garantindo `project_type`, `areas` e etapas atualizados.

---

## 3. Arquivos modificados / criados

### Backend (novos)

- `packages/backend/src/controllers/projectAreasController.ts`
- `packages/backend/src/routes/projectAreasRoutes.ts`

### Backend (alterados)

- `packages/backend/src/controllers/projectsController.ts` — `getProjectById` passa a retornar `areas` quando aplicável.
- `packages/backend/src/index.ts` — registro de `projectAreasRoutes`.

### Frontend (novos)

- `src/lib/projectFeatures.ts` — hasAreas / hasVersions.
- `src/components/projects/ProjectAreasSection.tsx` — seção de áreas com CRUD.

### Frontend (alterados)

- `src/services/projects.ts` — tipo `ProjectArea`, `areas` em `Project`, métodos de áreas.
- `src/components/projects/types.ts` — `ProjectArea`, `ProjectType`, `areas` em `Project`.
- `src/pages/Projects.tsx` — uso de `project_type` na lista; carregamento de `getProjectById` + áreas no detalhe; handlers de áreas; remoção do early-return; renderização de `ProjectAreasSection`.

---

## 4. Validação dos cenários

| Cenário | Resultado esperado | Como validar |
|--------|--------------------|---------------|
| **Criar projeto SIMPLE** | Não deve ter áreas; deve ter etapas padrão (A Fazer, Em Andamento, Revisão, Concluídos). | Wizard: tipo “Projeto simples”. Após criar, abrir projeto: sem seção “Áreas”; aba Etapas com as 4 listas. |
| **Criar projeto AREAS** | Deve permitir definir áreas iniciais; deve gerar etapas padrão; após criar, áreas devem aparecer e permitir CRUD. | Wizard: tipo “Projeto com áreas”, adicionar 1+ áreas. Após criar, abrir projeto: seção “Áreas do projeto” com as áreas; aba Etapas com as 4 listas; criar/editar/excluir área. |
| **Criar projeto ADVANCED** | Deve permitir áreas e versão inicial; etapas padrão; após criar, áreas e CRUD de áreas. | Wizard: tipo “Projeto avançado”, áreas e opcionalmente primeira versão. Após criar, abrir projeto: seção Áreas; etapas padrão; CRUD de áreas. |
| **CRUD de áreas** | Criar, editar e excluir áreas em projeto AREAS ou ADVANCED. | Na tela do projeto (AREAS ou ADVANCED): “Nova área”, preencher nome, Criar; editar nome (ícone lápis); excluir (ícone lixeira e confirmar). |
| **UI refletindo tipo** | SIMPLE: sem seção Áreas. AREAS/ADVANCED: seção Áreas visível. | Abrir um projeto SIMPLE: não deve aparecer “Áreas do projeto”. Abrir AREAS ou ADVANCED: deve aparecer a seção. |

---

## 5. Resumo do “resolver” de features

- **Backend:** `projectAllowsAreas(projectType)` em `projectAreasController` (e uso implícito em `getProjectById`: só preenche `areas` para `areas`/`advanced`).
- **Frontend:** `hasAreas(projectType)` e `hasVersions(projectType)` em `src/lib/projectFeatures.ts`.
- **Regras:**  
  - **AREAS:** permite áreas; não versões.  
  - **ADVANCED:** permite áreas e versões.  
  - **SIMPLE:** sem áreas nem versões.  
  - **TEMPLATE:** regras específicas de template (fora do escopo desta auditoria).

Etapas padrão são criadas no backend para `simple`, `areas` e `advanced` na criação do projeto; o frontend sempre carrega listas ao abrir o detalhe, refletindo essas etapas.
