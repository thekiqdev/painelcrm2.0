# Plano: Kanban/Chat — valor comercial via propostas e suporte a lead

**Escopo:** planejamento técnico e funcional apenas — **sem implementação neste documento**.  
**Objetivo:** usar **propostas/orçamentos** como fonte única de valor comercial no kanban do chat, com configuração por coluna, automação de movimento ao aceitar, modelo por coluna, e suporte a **cliente** e **lead**, **sem** criar um módulo paralelo de “oportunidades”.  
**Restrição:** compatibilidade com produção (migrações incrementais, feature flags opcionais, sem quebrar fluxos atuais).

---

## 1. Resumo executivo

| Tema | Situação hoje | Direção proposta |
|------|----------------|------------------|
| Valor no card do kanban | Cartão mostra conversa (nome, telefone, preview, badges Cliente/Lead); **não há valor de proposta** | Calcular totais a partir de `proposals` ligadas à **mesma conversa** (via `client_id` / `lead_id` alinhados ao `chat_conversations`) e exibir conforme regra da coluna |
| Configuração por coluna | `metadata` da coluna: `kanban_column_ui`, `kanban_column_rules`, `kanban_phase2` (CRM, tarefas, auto-move **por tempo**) | Estender `metadata` (ou `kanban_phase2`) com bloco **`kanban_proposals`** para exibição (pendente/aceito) e automação (mover ao aceitar + coluna destino) |
| Automação de card | **Já existe** movimento agendado por tempo (`auto_move_by_time` → `chat_kanban_scheduled_moves` + worker) | **Novo gatilho:** evento de negócio “proposta aceita” → enfileirar movimento de card (reutilizar pipeline interno de patch de card onde possível) |
| Proposta × cliente | `proposals.client_id` opcional; faturamento exige cliente | Manter; reforçar regras na UI/API |
| Proposta × lead | **Não existe coluna `lead_id`** no modelo canônico atual | Migração: `lead_id` nullable + integridade + índices |
| Funil de propostas | `funnel_id` / `stage_id` na proposta; quadro kanban pode ter `linked_sales_funnel_id` e coluna com `funnel_stage_id` | “Modelo por coluna” pode mapear para **estágio padrão** + metadados de texto/itens (sem novo módulo) |

---

## 2. Arquitetura atual (investigação)

### 2.1 Kanban do chat

- **Entidades:** `chat_kanban_boards`, `chat_kanban_columns`, `chat_kanban_cards` (cartão = `conversation_id` + `column_id` + `position` + `metadata`).
- **Configuração de coluna:** campo JSON **`metadata`** persistido no backend; no frontend é parseado por:
  - `src/utils/kanbanColumnRulesUi.ts` — tipos `KanbanColumnUi`, `KanbanColumnRules`, `KanbanPhase2Config`.
- **Phase 2 já cobre:** notificações, webhook outbound, bloco **CRM** (`ensure_client_on_column_entry`, `auto_link_or_create_lead`), produtividade (criar tarefa), **automações** com **`auto_move_by_time`** (coluna destino + atraso).
- **Worker:** `packages/backend/src/services/kanbanScheduledMoveService.ts` — agenda e executa movimentos; auditoria em `chat_conversation_assignment_history`.
- **UI do card:** `src/components/chat-kanban/ChatKanbanCard.tsx` + `src/utils/chatKanbanCardDisplay.ts` — não há campo de valor monetário; há badges Cliente/Lead a partir de `conv_client_id` / `conv_lead_id`.
- **Página:** `src/pages/ChatKanbanPage.tsx` — carrega boards, colunas, cards via `src/services/chatKanban.ts` (`/api/chat/kanban/...`).
- **Definições de coluna (UI):** `src/components/chat-kanban/ChatKanbanColumnSettingsSheet.tsx` — ponto natural para novas opções de propostas.

### 2.2 Propostas (backend e modelo)

- **API:** `packages/backend/src/controllers/proposalsController.ts` — CRUD, filtros, conversão em fatura.
- **Schema Zod (create):** `client_id` opcional/nullable UUID; `funnel_id`, `stage_id`; `status` em `draft`, `sent`, `accepted`, `rejected`, `expired` (criação); estados como `invoiced` aparecem após conversão/patch em fluxos reais.
- **INSERT atual:** apenas `client_id` (não `lead_id`) — `database/init/12_create_proposals.sql` confirma colunas iniciais; evoluções posteriores podem ter adicionado `post_accept_billing_mode`, `converted_invoice_id`, etc. (tratadas no código com defensividade).
- **Faturamento:** `packages/backend/src/services/proposalInvoiceConversionService.ts` — exige `status === 'accepted'`, **`client_id` obrigatório**, ausência de fatura prévia.
- **Aceite público:** `packages/backend/src/services/proposalPublicAcceptHooks.ts` — `auto_pending_invoice` **não** gera fatura se não houver `clientId`; notificação orienta associar cliente.

### 2.3 Chat — criação de proposta

- `src/pages/Chat.tsx` — `ProposalCreateForm` em modo `embedded` com `initialClientId={selectedConversation.client_id ?? null}` e título sugerido pelo nome cliente/lead — **não** passa `lead_id` hoje porque o tipo/API não expõem.

### 2.4 Funil comercial (propostas)

- Propostas já podem ter `funnel_id` / `stage_id` alinhados a funis tipo propostas; o quadro kanban pode estar **`linked_sales_funnel_id`** e cada coluna **`funnel_stage_id`** — isso é **aproximação** de “estágio” mas **não** liga automaticamente o cartão do kanban a uma proposta específica.

---

## 3. Proposta de arquitetura nova

### 3.1 Fonte de valor no kanban

- **Princípio:** o valor comercial exibido no card vem **exclusivamente** de registros em **`proposals`**, filtrados por vínculo com a **conversa do cartão**.
- **Ligação conversa ↔ proposta (sem `conversation_id` na tabela `proposals` na primeira versão):**
  - Resolver `chat_conversations.client_id` e `chat_conversations.lead_id` para a `conversation_id` do cartão.
  - Buscar propostas do tenant onde:
    - `(proposals.client_id = conv.client_id AND conv.client_id IS NOT NULL)` **OU**
    - `(proposals.lead_id = conv.lead_id AND conv.lead_id IS NOT NULL)` *(após introduzir `lead_id`)*.
  - **Desempate / duplicidade:** se conversa tiver cliente e ainda existir proposta só com `lead_id` antigo, política explícita na implementação (ex.: preferir `client_id` quando ambos existirem após migração assistida).

**Alternativa futura (opcional):** coluna `conversation_id` em `proposals` para rastreio explícito e queries mais baratas — aumenta impacto em migração e privacidade; só se a ambiguidade cliente/lead for frequente.

### 3.2 Metadados da coluna para propostas

Introduzir um objeto versionado, por exemplo **`kanban_proposals`** dentro de `chat_kanban_columns.metadata` (ou nested em `kanban_phase2` com cuidado para não quebrar parse no backend):

Sugestão de campos (nomes indicativos):

| Campo | Função |
|-------|--------|
| `display.pending_enabled` | Somar/mostrar propostas **pendentes** (ver §4) |
| `display.accepted_enabled` | Somar/mostrar propostas **aceitas** |
| `display.include_invoiced_in_accepted` | Se `accepted` deve incluir valor já **faturado** (`invoiced`) na soma “aceito” ou só linha separada |
| `automation.move_on_accept` | Ao aceitar proposta (qualquer canal), mover cartão |
| `automation.target_column_id` | UUID da coluna destino no **mesmo board** |
| `defaults.funnel_stage_id` / `defaults.funnel_id` | Pré-preencher criação no chat quando o card está nesta coluna |
| `defaults.proposal_title_template` / `defaults.items_seed` | Texto/itens iniciais (JSON leve), **assistido** — não envio automático sem confirmação humana salvo decisão explícita de produto |

Compatibilidade: valores default “desligados” preservam comportamento atual.

### 3.3 Automação: mover card quando proposta for aceita

- **Gatilho:** transição de proposta para `accepted` (API interna, aceite público, ou PATCH manual com permissões).
- **Ação:** localizar **cartões ativos** do kanban cujo `conversation_id` casa com a proposta (via regra §3.1); para cada coluna de origem do card, ler `kanban_proposals.automation`; se `move_on_accept` e `target_column_id` válidos no board, executar movimento equivalente a `PATCH .../cards/:id` com as mesmas validações de pipeline (`kanbanInternalCardColumnPipeline`, regras de coluna, RLS).
- **Concorrência:** se múltiplas colunas disparem, definir política (ex.: só mover se card está em coluna que tem a automação habilitada **ou** primeira coluna que match — documentar na implementação).

**Diferença do que já existe:** hoje o auto-move é **temporal**; aqui é **event-driven** (domínio proposta).

### 3.4 Modelo de proposta por coluna

- **Abordagem segura (recomendada):** “modelo” = **defaults não destrutivos**: ao abrir `ProposalCreateForm` a partir de um card nesta coluna, aplicar `funnel_id`/`stage_id` da coluna (e do board quando `linked_sales_funnel_id` existir), mais templates de título/itens em metadata.
- **Evitar:** envio automático “sent” ao entrar na coluna sem revisão humana, salvo requisito futuro explícito e mitigação legal/operacional.

---

## 4. Regra de cálculo: pendentes e aceitas

Proposta com status (canônico no produto):

| Status | Incluir em “pendente” | Incluir em “aceito” | Observação |
|--------|-------------------------|----------------------|------------|
| `draft` | Não (default) | Não | Opcional futuro: “rascunho comercial” — fora do escopo mínimo |
| `sent` | **Sim** | Não | Proposta enviada / em análise |
| `accepted` | Não | **Sim** | Valor ganho comercialmente |
| `rejected` | Não | Não | |
| `expired` | Não | Não | |
| `invoiced` | Não | **Configurável** | Tratar como pós-aceite: ou somar em “aceito” (valor já comprometido) ou linha à parte “faturado”; **recomendação:** na métrica “aceito” do kanban, **incluir `invoiced`** no mesmo agregado “aceito” para não perder o valor após faturar, **ou** exibir duas linhas: “Aceito (aberto)” vs “Faturado” conforme `display.*` |

**Justificativa:** `sent` = compromisso comercial explícito com o cliente/lead; `draft` polui e mistura pipeline interno; `invoiced` é continuidade de `accepted` no ERP.

---

## 5. Modelagem cliente e lead

### 5.1 Estado atual

- `proposals.client_id` — opcional.
- **Sem** `lead_id` na DDL legada consultada.

### 5.2 Proposta alvo

- Adicionar **`lead_id UUID NULL REFERENCES leads(id) ON DELETE SET NULL`** (ou equivalente), com índice `(tenant via user_id join)` / `lead_id`.
- **Integridade recomendada (CHECK ou validação na API):**
  - No máximo um entre contexto “CRM primário”: **não** permitir `client_id` e `lead_id` **ambos** preenchidos para a mesma proposta **salvo** estratégia de migração temporária.
  - Permitir **ambos nulos** apenas para rascunhos globais (comportamento já possível hoje para drafts sem cliente).

### 5.3 Impactos

| Área | Impacto |
|------|---------|
| Criação (chat) | Preencher `lead_id` quando `conversation.lead_id` e não houver `client_id` |
| Listagem / filtros | Estender filtros `GET /api/proposals` com `lead_id` opcional |
| Página pública | Continua baseada em token da proposta; **não** exige lead |
| Kanban | Agregação por conversa usando cliente OU lead |
| Aceite | Independente de lead/cliente para registrar aceite; **faturamento** continua dependente de cliente |
| Faturamento | Inalterado: exige `client_id` |

---

## 6. Regra de faturamento (reforço)

- **Proposta com apenas `lead_id`:** pode ser enviada/aceita; **não** gera fatura até existir **`client_id` válido**.
- **Caminhos de UX:** (1) converter lead em cliente e **atualizar proposta** com `client_id` (e opcionalmente limpar `lead_id`); (2) associar cliente manualmente na proposta antes de “Gerar fatura”.
- **Backend já alinhado:** `convertAcceptedProposalToInvoice` e hooks de aceite público com `auto_pending_invoice` tratam ausência de cliente.

---

## 7. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Migração BD (`lead_id`) | Migration idempotente; backfill desnecessário se coluna nullable; testes em cópia de produção |
| Performance (N+1 no kanban) | Endpoint agregado `/api/chat/kanban/boards/:id/proposal-totals` ou incluir totais na listagem de cards em uma query agrupada |
| Duplicar valor (mesma proposta contada duas vezes) | Regra única de join conversa↔proposta; testes com conversa só lead → só propostas `lead_id` |
| Regressão no scheduled move | Novo fluxo não altera `auto_move_by_time` sem feature flag |
| Permissões | Movimento automático respeita mesmo usuário/sistema actor que o pipeline já usa para automações |
| Aceite fora do chat | Listener centralizado no serviço que altera status para `accepted` (API + público) |

---

## 8. Ordem recomendada de implementação (alto nível)

1. **Modelo de dados:** `lead_id` + constraints + API (create/patch/list) + chat preenchendo lead.
2. **Consulta agregada:** totais por conversa (ou por card) para pendente/aceito sem N+1.
3. **UI kanban:** exibir valores no card conforme metadata da coluna (leitura).
4. **Metadata coluna:** UI em `ChatKanbanColumnSettingsSheet` + validação backend ao salvar metadata.
5. **Automação:** hook pós-`accepted` → mover card (feature flag).
6. **Defaults de criação:** aplicar modelo por coluna no `ProposalCreateForm` quando aberto do contexto kanban.

---

## 9. Critérios de sucesso (para fase de implementação futura)

- Cards mostram valores **coerentes** com propostas reais e com as opções da coluna.
- Proposta pode existir para **lead** ou **cliente**, com regras de integridade claras.
- Faturamento continua bloqueado sem cliente.
- Nenhum módulo “oportunidades” novo; apenas **propostas** + **metadata** do kanban.
- Migrações e deploy compatíveis com produção (rollback documentado).

---

*Documento gerado como plano pré-implementação; ajustar após revisão de produto e de carga em queries.*
