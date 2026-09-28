# Plano de implantação — Wizard multi-etapas para criação de projetos

**Objetivo:** Substituir o formulário simples atual por um fluxo guiado em etapas para criação de projetos no CRM, permitindo escolha de tipo (simples, com áreas, avançado) ou uso de template.

**Diretriz:** Cada fase abaixo será iniciada sob seu comando. O plano é incremental e não quebra a criação atual até a fase de substituição opcional.

---

## Visão geral do fluxo do wizard

| Etapa | Nome | Conteúdo |
|-------|------|----------|
| 1 | Seleção de modelo | 4 cards: Projeto simples, Projeto com áreas, Projeto avançado, Usar template |
| 2 | Configurações básicas | Nome, cliente (opcional), descrição, responsáveis, datas (opcional) |
| 3 | Configuração específica | Varia por tipo: nada / áreas iniciais / áreas + versão / preview template |
| 4 | Revisão e criação | Resumo + botão "Criar projeto" |

---

## Fase 0 — Fundação (modelagem e compatibilidade)

**Objetivo:** Introduzir `project_type` e estruturas de template sem alterar o fluxo atual de criação. Criação antiga continua funcionando (tipo implícito = simple).

### 0.1 Modelagem de dados

**Alterações em `projects` (ou equivalente):**

- `project_type` — enum ou string: `'simple' | 'areas' | 'advanced' | 'template'`.
- `template_id` — UUID, nullable, FK para `project_templates` (criada nesta fase).
- `source_template_id` — UUID, nullable; preenchido quando o projeto foi criado a partir de um template (auditoria/origem).

**Nova tabela `project_templates`:**

- `id` (UUID, PK)
- `name`, `slug`, `description` (opcional)
- `project_type` — mesmo enum (`simple` | `areas` | `advanced`)
- `tenant_id` — nullable; null = template do sistema, preenchido = template do usuário
- `created_by` (user_id), `created_at`, `updated_at`
- `is_system` — boolean; true apenas para templates futuros do sistema

**Nova tabela `project_template_areas`:**

- `id`, `template_id` (FK), `name`, `sort_order`
- Para templates do tipo "areas" ou "advanced".

**Tabela `project_template_versions` (futuro):**

- Reservar nome e documentar; implementação em fase posterior para "Projeto avançado" (versões/releases).

**Regras:**

- Projetos existentes: migration define `project_type = 'simple'` e `template_id = null`.
- Constraints: se `project_type = 'template'`, então `template_id` NOT NULL; caso contrário, `template_id` NULL.

### 0.2 Backend — compatibilidade

- Endpoint atual de criação de projeto passa a aceitar opcionalmente `project_type` (default `'simple'`) e `template_id`.
- Se `project_type` não enviado, tratar como `simple`; não exibir ainda no formulário antigo.
- Validação: se `template_id` enviado, validar existência e tenant; criar projeto com estrutura clonada do template (Fase 2 detalha clonagem).

### 0.3 Entregável Fase 0

- Migration: colunas `project_type`, `template_id`, `source_template_id` em `projects`; tabelas `project_templates`, `project_template_areas`; comentário/placeholder para `project_template_versions`.
- API: criação de projeto aceita e persiste `project_type` e `template_id`; resposta inclui esses campos.
- Documentação: este plano + seção "Modelagem" atualizada.

**Comando para iniciar:** *"Iniciar Fase 0 do plano wizard de projetos"*.

---

## Fase 1 — Wizard: estrutura e Etapa 1 (seleção de modelo)

**Objetivo:** Nova rota e layout do wizard; apenas Etapa 1 implementada (4 cards); estado do fluxo em memória; ainda sem persistência pelo wizard (opcional: ao concluir etapa 1, redirecionar para criação antiga com tipo preenchido).

### 1.1 Rota e layout

- Rota: `/projects/new` (ou `/projects/create`) renderiza o wizard.
- Layout: cabeçalho com título "Novo projeto", indicador de etapas (1 de 4, 2 de 4, …), área de conteúdo, botões "Voltar" / "Próximo" ou "Continuar".

### 1.2 Estado global do fluxo

- Context ou estado local (ex.: React state no componente pai do wizard):
  - `step: 1 | 2 | 3 | 4`
  - `projectType: 'simple' | 'areas' | 'advanced' | 'template' | null`
  - `templateId: string | null`
  - `basicConfig: { name, clientId, description, responsibleIds, startDate?, endDate? }`
  - `specificConfig: { areas?: string[], createFirstVersion?: boolean, ... }`
- Persistência temporária: opcional `sessionStorage` para recuperar em caso de refresh (Fase 3 ou 4).

### 1.3 Etapa 1 — UI

- 4 cards clicáveis (grid 2x2 ou lista responsiva):
  1. **Projeto simples** — descrição, ícone, "tarefas, etapas, sem áreas, sem versões".
  2. **Projeto com áreas** — "áreas, tarefas, etapas, controle de acesso por área".
  3. **Projeto avançado** — "áreas, versões, backlog, roadmap".
  4. **Usar template** — "iniciar a partir de template pronto"; ao clicar, pode abrir subview (lista de templates) ou ir para Etapa 2 e na 3 mostrar seleção de template.
- Ao selecionar um card: atualizar `projectType` (e, se "template", na Etapa 3 ou em sub-etapa, `templateId`); habilitar "Próximo" e avançar para Etapa 2.

### 1.4 Navegação

- "Próximo": validação mínima da etapa atual; avançar step.
- "Voltar": step - 1 sem validar.
- Indicador de progresso: steps 1–4 visíveis; step atual destacado.

### 1.5 Entregável Fase 1

- Página/container do wizard com steps e estado.
- Etapa 1 com 4 cards e seleção de tipo (e, se for "template", fluxo para escolher template na Etapa 3).
- Navegação Próximo/Voltar e indicador de etapas.
- Integração opcional: ao final da Etapa 1, se desejar manter criação antiga, link "Continuar com formulário clássico" passando `project_type` na query.

**Comando para iniciar:** *"Iniciar Fase 1 do plano wizard de projetos"*.

---

## Fase 2 — Wizard: Etapa 2 (configurações básicas) e Etapa 4 (revisão)

**Objetivo:** Formulário da Etapa 2; tela de revisão da Etapa 4; chamada ao backend para criar projeto (com tipo e dados básicos). Criação pelo wizard passa a funcionar para tipo "simple" sem áreas/versões.

### 2.1 Etapa 2 — Formulário

- Campos: nome (obrigatório), cliente (opcional, select/search), descrição (opcional), responsáveis iniciais (multiselect), data início/fim (opcional).
- Validação: pelo menos nome preenchido para habilitar "Próximo".
- Acessibilidade e labels claros; estado salvo em `basicConfig`.

### 2.2 Etapa 4 — Revisão

- Resumo em cards ou lista: tipo do projeto, nome, cliente (se houver), áreas (se houver, Fase 3), versão inicial (se houver), responsáveis, datas.
- Botão "Criar projeto": envia para API com `project_type`, `name`, `client_id`, `description`, `responsible_ids`, `start_date`, `end_date`; para tipo "template", `template_id` e lógica de clonagem no backend (ver Fase 2 backend).

### 2.3 Backend — Criação condicional

- `POST /api/projects` (ou equivalente) passa a:
  - Aceitar `project_type`, `template_id`, e demais campos atuais.
  - Se `project_type === 'template'` e `template_id` presente: carregar template, clonar estrutura (projeto + listas/etapas + áreas se houver), criar projeto com `source_template_id = template_id`.
  - Se `project_type === 'areas' | 'advanced'`: criar projeto e, em seguida, criar áreas iniciais se enviadas em `initial_areas` (array de nomes).
  - Se `project_type === 'simple'` ou não informado: comportamento atual (criar projeto e estrutura padrão).
- Validações: tenant, permissões, existência de template quando `template_id` enviado.
- Rollback: usar transação; em caso de falha em qualquer passo, rollback e retornar erro.

### 2.4 Clonagem de template

- Dado um `template_id` válido para o tenant (ou template do sistema):
  - Criar projeto com nome/descrição do usuário (ou do template como default).
  - Copiar `project_template_areas` → criar áreas do projeto.
  - Copiar listas/etapas padrão do template (se houver tabela de template_lists/template_stages) ou usar estrutura fixa por `project_type`.
  - Definir `source_template_id` no projeto criado.

### 2.5 Entregável Fase 2

- Etapa 2 completa com validação e estado.
- Etapa 4 com resumo e botão "Criar projeto".
- API: criação condicional por tipo e clonagem a partir de template; transação e rollback.
- Fluxo completo funcional para tipo "simple" e "template" (com templates existentes).

**Comando para iniciar:** *"Iniciar Fase 2 do plano wizard de projetos"*.

---

## Fase 3 — Wizard: Etapa 3 (configuração específica) e templates

**Objetivo:** Etapa 3 varia conforme o tipo; criação de áreas iniciais para "areas" e "advanced"; primeira versão opcional para "advanced"; preview e confirmação para "template".

### 3.1 Etapa 3 — Projeto simples

- Nenhuma configuração extra: mensagem curta "Nada a configurar" e botão "Próximo" (ou ir direto para Etapa 4).

### 3.2 Etapa 3 — Projeto com áreas

- Opção: "Criar áreas agora" (lista de nomes com add/remove) ou "Criar áreas depois".
- Se "criar agora", coletar nomes e salvar em `specificConfig.areas`; na criação (Etapa 4), enviar `initial_areas` ao backend.

### 3.3 Etapa 3 — Projeto avançado

- Mesmo bloco de áreas iniciais que "Projeto com áreas".
- Bloco adicional: "Criar primeira versão agora?" (sim/não); se sim, nome e talvez data; salvar em `specificConfig.createFirstVersion` e dados da versão; backend cria primeira versão após criar projeto (tabela de versões/releases a ser definida na modelagem).

### 3.4 Etapa 3 — Template

- Listar templates disponíveis: do sistema (se existirem) e do usuário/tenant; seleção por card ou select.
- Preview: ao selecionar template, mostrar resumo (nome do template, áreas, etapas) e botão "Usar este template"; definir `templateId` e seguir para Etapa 4.

### 3.5 Backend — Áreas e primeira versão

- Criação para tipo "areas" ou "advanced": aceitar `initial_areas` (array de strings) e criar registros em `project_areas` (ou equivalente) na mesma transação do projeto.
- Para "advanced", se `create_first_version` enviado: criar registro em tabela de versões/releases e vincular ao projeto.

### 3.6 Entregável Fase 3

- Etapa 3 implementada para os 4 tipos (simple, areas, advanced, template).
- API: suporte a `initial_areas` e primeira versão para "advanced".
- Listagem e seleção de templates na Etapa 3 para tipo "template".

**Comando para iniciar:** *"Iniciar Fase 3 do plano wizard de projetos"*.

---

## Fase 4 — UX, persistência temporária e validações

**Objetivo:** Refinar UX (layout dos cards, acessibilidade, feedback de erro); persistência temporária do wizard (sessionStorage); validações mínimas por etapa; possibilidade de "Salvar rascunho" (opcional, apenas desenho ou flag para futuro).

### 4.1 Layout e acessibilidade

- Cards da Etapa 1: tamanhos consistentes, hover/focus visível, descrições curtas; ícones por tipo.
- Indicador de progresso: steps 1–4 sempre visíveis; step atual e concluídos com estado visual distinto.
- Mensagens de validação: inline por campo e resumo no topo se houver múltiplos erros.

### 4.2 Persistência temporária

- Ao mudar de etapa ou alterar dados: gravar no `sessionStorage` (ex.: chave `project_wizard_draft`) o estado do wizard (step, projectType, templateId, basicConfig, specificConfig).
- Ao montar o wizard: se houver draft, perguntar "Continuar rascunho?" ou restaurar automaticamente; opção "Começar do zero" limpa o draft.

### 4.3 Validações por etapa

- Etapa 1: pelo menos um tipo selecionado (sempre true ao avançar).
- Etapa 2: nome obrigatório; cliente e datas opcionais; responsáveis opcional.
- Etapa 3: conforme tipo (ex.: se "criar áreas agora", pelo menos um nome; template obrigatório quando tipo "template").
- Etapa 4: apenas confirmação; erros de API exibidos na própria tela de revisão.

### 4.4 Salvar como rascunho (opcional)

- Botão "Salvar rascunho" em qualquer etapa: persiste estado no backend (tabela `project_drafts` ou similar) ou apenas em `sessionStorage`; documento de plano menciona que implementação completa pode ser fase futura.

### 4.5 Entregável Fase 4

- UX revisada (cards, progresso, erros).
- Persistência em sessionStorage e recuperação de rascunho.
- Validações mínimas documentadas e aplicadas.
- Opção de rascunho desenhada (e implementada em sessionStorage ou backend, conforme escopo).

**Comando para iniciar:** *"Iniciar Fase 4 do plano wizard de projetos"*.

---

## Fase 5 — Integração com fluxo atual e extensibilidade

**Objetivo:** Decisão sobre substituição ou coexistência do formulário antigo; link "Criar projeto" apontando para o wizard; documentação para adicionar novas etapas ou novos tipos no futuro.

### 5.1 Ponto de entrada

- Botão/link principal "Novo projeto" ou "Criar projeto" passa a abrir o wizard (`/projects/new`).
- Opcional: em configurações ou menu avançado, "Criar projeto (formulário clássico)" ainda abre o formulário antigo com `project_type=simple` por default.

### 5.2 Extensibilidade

- Documentar no código: onde adicionar um novo step (array de steps, componente por step, validação por step).
- Documentar: como adicionar um novo `project_type` (backend: enum/const; frontend: novo card na Etapa 1 e branch na Etapa 3).
- Estratégia de templates do sistema: templates com `tenant_id = null` e `is_system = true`; listados na Etapa 3 quando tipo "template"; criação/edição por super admin em fase futura.

### 5.3 Entregável Fase 5

- "Novo projeto" abre o wizard por default.
- Documentação interna: extensão de etapas e de tipos.
- (Opcional) Formulário clássico ainda acessível por link secundário.

**Comando para iniciar:** *"Iniciar Fase 5 do plano wizard de projetos"*.

---

## Regras de negócio consolidadas

- **project_type:** sempre persistido; define capabilities (áreas, versões, backlog) e comportamento da Etapa 3.
- **template_id:** preenchido apenas quando origem for template; projeto criado por clonagem; `source_template_id` guarda auditoria.
- **Capabilities:** derivadas do tipo (simple: tarefas/etapas; areas: + áreas e acesso; advanced: + versões/backlog); não duplicar lógica entre tipos e templates — templates apenas preenchem estrutura.
- **Conversão de tipo:** planejada para o futuro (ex.: simple → areas); não implementar na primeira versão; modelagem deve evitar travas que impeçam conversão depois.
- **Templates:** não duplicam regras de negócio; apenas definem estrutura (áreas, listas, etapas) a ser clonada.

---

## Riscos técnicos e mitigações

| Risco | Mitigação |
|-------|------------|
| Quebrar criação atual | Fase 0 e 2 mantêm API compatível; wizard envia mesmos campos; formulário antigo pode continuar até Fase 5 |
| Complexidade de clonagem | Implementar clonagem mínima (projeto + áreas + listas padrão); versões em fase posterior |
| Estado do wizard perdido (refresh) | sessionStorage na Fase 4; opcional backend draft |
| Muitos tipos/etapas no futuro | Arquitetura com steps configuráveis e branches por tipo documentados na Fase 5 |

---

## Estratégia incremental (resumo)

1. **Fase 0:** Modelagem e API compatível; nenhuma mudança de UX.
2. **Fase 1:** Só wizard e Etapa 1; criação ainda pelo fluxo antigo ou link com tipo.
3. **Fase 2:** Etapas 2 e 4 e criação real pelo wizard para simple (e template se já houver templates).
4. **Fase 3:** Etapa 3 completa; áreas iniciais e primeira versão; templates selecionáveis.
5. **Fase 4:** UX, rascunho e validações.
6. **Fase 5:** Wizard como fluxo principal e doc de extensão.

---

## Como usar este plano

Para iniciar uma fase, diga por exemplo:

- *"Iniciar Fase 0 do plano wizard de projetos"*
- *"Iniciar Fase 1 do plano wizard de projetos"*

E assim por diante. Cada fase será implementada na ordem, sem pular dependências (0 → 1 → 2 → 3 → 4 → 5).
