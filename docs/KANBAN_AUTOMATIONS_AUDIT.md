# Auditoria — Engine de automações do Kanban (Chat)

**Escopo:** inventário do que existe hoje no repositório `painelcrm` (backend + frontend), sem propor refactor ou migração neste documento além de uma **evolução incremental sugerida**.

**Regra explícita:** nenhuma alteração destrutiva foi feita para gerar este relatório; trata-se de **mapeamento e análise**.

---

## 1. Estrutura atual

### 1.1 Tabelas (PostgreSQL)

| Tabela | Função |
|--------|--------|
| `chat_kanban_boards` | Quadros por tenant; `linked_sales_funnel_id` liga ao funil comercial quando configurado. |
| `chat_kanban_columns` | Colunas; `metadata` JSONB agrega **todas** as automações por coluna; `funnel_stage_id` opcional para sync CRM. |
| `chat_kanban_cards` | Cartões; `metadata` inclui carimbos de idempotência (ex.: proposta automática por coluna). |
| `chat_kanban_scheduled_moves` | Fila de **movimentos agendados por tempo** (`status`, `scheduled_for`, `from_column_id`, `to_column_id`). Índice único parcial por `(card_id, from_column_id)` quando `scheduled`. |
| `chat_kanban_tags` | Tags reutilizáveis por tenant (para automação de entrada por tag). |

**Observação:** não existe tabela dedicada “rules” ou “workflows”; regras residem em **JSON em `chat_kanban_columns.metadata`**.

### 1.2 Modelos / tipos principais (código)

- **`packages/backend/src/utils/kanbanPhase2.ts`** — `ParsedKanbanPhase2`: `notifications`, `webhook`, `crm`, `productivity`, `automations.auto_move_by_time`.
- **`packages/backend/src/utils/kanbanColumnRules.ts`** — `ParsedKanbanColumnRules` em `metadata.kanban_column_rules`.
- **`packages/backend/src/utils/kanbanProposalsMetadata.ts`** — `KanbanProposalsMetadata` em `metadata.kanban_proposals`.
- **`packages/backend/src/utils/kanbanAutomationConfigMetadata.ts`** — saneamento de `metadata.automation_config` (entrada automática).
- **`packages/backend/src/services/chatKanbanAutomationService.ts`** — `KanbanColumnEntryAutomationReason`, `ApplyKanbanAutomationInput`.

Frontend espelha parsing em **`src/utils/kanbanColumnRulesUi.ts`** e monta UI em **`ChatKanbanColumnSettingsSheet.tsx`**.

### 1.3 Serviços centrais

| Serviço | Papel |
|---------|--------|
| `kanbanInternalCardColumnPipeline.ts` | Orquestra **efeitos ao entrar na coluna** (regras antes do UPDATE do cartão + automações **depois** do UPDATE na mesma TX). |
| `kanbanColumnAutomationService.ts` | Lead ao entrar, garantir cliente, sync estágio CRM, tarefa, notificações Phase2, webhook, mensagem automática (texto / modelo WhatsApp), auditoria. |
| `kanbanColumnAutoProposalService.ts` | Criar **proposta** ao entrar na coluna (`kanban_proposals.auto_create_proposal_on_enter`). |
| `kanbanScheduledMoveService.ts` | Inserir / cancelar agendamentos; **worker em loop** processa linhas vencidas e executa movimento + mesma pipeline de coluna. |
| `chatKanbanAutomationService.ts` | **Entrada no quadro** por conversa (nova / tag / lead / cliente); insere cartão se ausente; pode agendar move por tempo ao criar cartão. |
| `proposalKanbanAcceptAutomationService.ts` | Ao **aceitar proposta**, move cartão conforme coluna de origem (`move_on_proposal_accept`). |

### 1.4 Scheduler / workers

- **Não** há fila tipo Redis para Kanban: uso de **`setInterval`** no arranque do servidor (`packages/backend/src/index.ts`).
- **`processDueKanbanScheduledMovesBatch`** — intervalo configurável via `KANBAN_SCHEDULED_MOVE_POLL_MS` (default efetivo mínimo ~30s no código do servidor).
- Processamento em **batch** (ex.: 25 linhas por tick).

### 1.5 Endpoints REST (Kanban)

Prefixo API: **`/api/chat/kanban`** (`packages/backend/src/routes/chatKanbanRoutes.ts`).

Operações relevantes para automações:

- `PATCH /cards/:cardId` — mover cartão dispara pipeline de coluna.
- `PATCH /columns/:columnId` — persiste `metadata` (inclui todas as automações).
- `POST /boards/:boardId/cards`, `POST /attach-conversation` — criação de cartão / anexar conversa.

Propostas: aceitação dispara `runProposalKanbanAcceptAutomation` a partir de **`proposalsController`** / **`publicProposalViewController`** (fora do router Kanban).

Tags Kanban tenant: `GET/POST /api/chat/kanban/tags`.

### 1.6 Fluxo de execução (resumo)

**A) Cartão entra numa coluna** (drag-and-drop ou API `patchCard` com mudança de `column_id`):

1. `applyKanbanDestColumnEnterSideEffectsBeforeCardUpdate` — regras `kanban_column_rules` (atendimento + organização).
2. `UPDATE chat_kanban_cards` — nova coluna / posição.
3. `runKanbanDestColumnPostUpdateAutomations` — ordem atual no código:
   - ensure cliente (`crm.ensure_client_on_column_entry`);
   - lead (`crm.auto_link_or_create_lead`);
   - sync estágio funil (`runKanbanCrmStageSyncInTransaction`) se coluna tem `funnel_stage_id` e board tem funil;
   - criar tarefa (`productivity.auto_create_task`);
   - criar proposta (`kanban_proposals`).
4. `COMMIT`.
5. Se houve vínculo lead/cliente na mesma TX: **`runDeferredKanbanEntryAutomationsAfterCommit`** — pode criar cartões noutras colunas por “entrada automática”.
6. Assíncrono: **`runKanbanPhase2Automations`** — notificações internas, mensagem automática WhatsApp (texto ou modelo), webhook HTTP.

**B) Entrada automática no quadro** (conversa nova / tag / vínculo CRM):

- `applyKanbanAutomationForConversation` consulta colunas com `metadata.automation_config` e insere cartão se ainda não existir no board.

**C) Timer / mover após tempo**:

- Ao criar cartão na coluna (incl. entrada automática), `insertScheduledMoveIfColumnConfigured` pode registrar linha em `chat_kanban_scheduled_moves`.
- Worker move o cartão quando `scheduled_for` passa; ao mover, repete efeitos de coluna + Phase2.

---

## 2. Gatilhos existentes (lista)

Conceito atual: **não há motor genérico “trigger registry”** — cada gatilho está implementado em pontos específicos.

| Gatilho | Onde dispara | Notas |
|---------|----------------|-------|
| **Cartão movido para coluna** | `patchCard` quando `column_id` muda | Pipeline completa (regras + CRM + tarefa + proposta + Phase2 + agendamento). |
| **Cartão criado já na coluna** | `createCard` / fluxos que anexam conversa | Varia conforme implementação; scheduled move pode ser registado na criação quando aplicável. |
| **Tempo na coluna** | Worker `processDueKanbanScheduledMovesBatch` | Movimento automático para coluna destino (`kanban_phase2.automations.auto_move_by_time`). |
| **Proposta aceita** | `runProposalKanbanAcceptAutomation` | Move cartão para `target_column_id` se `move_on_proposal_accept`. |
| **Nova conversa** | `chatController` upsert, `messageService`, WhatsApp oficial ingest | `applyKanbanAutomationForConversation` com `new_conversation`. |
| **Tag Kanban adicionada à conversa** | `chatKanbanConversationKanbanTagsService` | `tag_added`. |
| **Vínculo manual conversa ↔ lead/cliente** | `linkConversation` | `lead_linked` / `client_linked`. |
| **Upsert conversa (match automático)** | `chatController` em transição para lead/cliente | Mesmos reasons quando estado muda. |
| **Lead convertido → cliente (CRM)** | `migrateConversationLeadToClient` | `client_linked` para automação de entrada. |
| **Coluna criou vínculo CRM na TX do cartão** | Após commit do `patchCard` | Defer `lead_linked` / `client_linked` para não duplicar lógica dentro da mesma transação. |

**Não encontrado como gatilho Kanban dedicado:** SLA por tempo sem resposta, “mensagem recebida/enviada” como trigger de coluna, “card parado X dias”, IA — podem existir noutros módulos (ex.: **Phase 6 chat** em `chatInboundAutomationHooks.ts`) mas **não** são a mesma engine que `kanban_phase2`.

---

## 3. Ações existentes (lista)

Ações são **efeitos colaterais** configurados por **blocos JSON** na coluna (e alguns serviços dedicados).

| Ação | Configuração / origem |
|------|------------------------|
| **Mover cartão (temporizado)** | `kanban_phase2.automations.auto_move_by_time` → linha em `chat_kanban_scheduled_moves`. |
| **Mover cartão (proposta aceite)** | `kanban_proposals.move_on_proposal_accept` + `target_column_id`. |
| **Encerrar conversa / limpar responsável / fila / atribuir equipe ou usuário** | `kanban_column_rules`. |
| **Adicionar / remover etiqueta (label) na conversa** | `kanban_column_rules` (`add_tag_label` / `remove_tag_label`). |
| **Definir prioridade da conversa** | `kanban_column_rules`. |
| **Exigir motivo / confirmação ao mover** | `kanban_column_rules`. |
| **Coluna terminal** | `kanban_column_rules.is_terminal` (UX/regras de movimento). |
| **Notificar operador / equipe** | `kanban_phase2.notifications`. |
| **Enviar mensagem automática (texto livre ou modelo WhatsApp)** | `kanban_phase2.notifications` (`auto_message_*`). |
| **Webhook HTTP** | `kanban_phase2.webhook`. |
| **Sincronizar estágio do funil no CRM** | Coluna com `funnel_stage_id` + board com funil; `runKanbanCrmStageSyncInTransaction`. |
| **Garantir / criar cliente a partir da conversa** | `kanban_phase2.crm.ensure_client_on_column_entry`. |
| **Dedupe / criar / vincular lead** | `kanban_phase2.crm.auto_link_or_create_lead` (+ flags). |
| **Criar tarefa** | `kanban_phase2.productivity.auto_create_task` (+ templates, prazo, assignee). |
| **Criar proposta comercial** | `kanban_proposals.auto_create_proposal_on_enter`. |
| **Inserir cartão no quadro** | `metadata.automation_config` (entrada por nova conversa / lead / cliente / tag). |

**Auditoria:** grande parte das automações Phase2/CRM escreve em **`chat_conversation_assignment_history`** com `operation` tipado (ex.: `kanban_phase2_webhook_outbound`, `kanban_phase2_crm_stage_sync`).

---

## 4. UX atual

Configuração por coluna em **`ChatKanbanColumnSettingsSheet.tsx`** (acordeões):

| Secção UI | Conteúdo aproximado |
|-----------|---------------------|
| **Automação de entrada** | Origens: novas conversas, leads, clientes, tags (`automation_config`). |
| **Atendimento** | Regras `kanban_column_rules` (subset “atendimento”). |
| **Organização** | Tags/prioridade (`kanban_column_rules`). |
| **Automações** | Subtítulo atual: mover após tempo — configura `auto_move_by_time`. |
| **Comercial** | CRM Phase2: cliente, lead, funil. |
| **Propostas** | Exibição, criar ao entrar, mover ao aceitar. |
| **Produtividade** | Tarefas automáticas. |
| **Comunicação** | Notificações + mensagem automática + webhook. |
| **SLA e validações avançadas** | Placeholder de produto (`FuturePlaceholder`): sem automações implementadas nesta secção. |
| **Funil** | Ligação estágio da coluna ao funil. |

Dupla nomenclatura **“Automação de entrada”** vs **“Automações”** reflete duas **engines** diferentes (entrada de cartão vs efeitos ao entrar na coluna + timer), o que pode confundir utilizadores avançados.

---

## 5. Problemas encontrados

### 5.1 Técnicos

- **Config dispersa num único JSON** (`metadata`): várias chaves raiz (`kanban_phase2`, `kanban_column_rules`, `kanban_proposals`, `automation_config`, UI auxiliar). Evolução e validação cruzada ficam mais difíceis.
- **Acoplamento e serviços grandes** — `kanbanColumnAutomationService.ts` concentra muitos comportamentos; dependências com `chatController` para envio de mensagens.
- **Phase2 “notifications”** mistura canais (notificação in-app, texto WhatsApp, webhook) num mesmo namespace.
- **Dependências circulares** mitigadas com `import()` dinâmico em alguns fluxos (scheduled move / proposal accept → entrada Kanban).
- **UI do temporizador**: backend aceita `seconds` em tipos (`kanbanPhase2`); UI de configuração pode não expor todos os valores — risco de discrepância UX/schema.

### 5.2 UX

- Vários acordeões com palavra “automação”; falta um **mapa mental único** (gatilho → ação).
- Condições genéricas (“se campo X”, “se tag Y”) **não** existem como camada única; comportamento é **hardcoded** por feature.

### 5.3 Escalabilidade / operações

- Worker por **polling** em DB: adequado a volume médio; para muito alto volume, avaliar fila dedicada ou advisory locks mais finos (não urgente sem métricas).
- Timers ligados a **cartão + coluna de origem**; mover antes cancela — documentar para utilizadores evita falsos problemas.

### 5.4 Duplicidade

- “Automação de entrada” vs automações ao **entrar na coluna** sobrepõem-se semanticamente com **leads/clientes** (uma adiciona cartão; outra cria vínculo ao mover). Documentação clara reduz duplicidade percebida.

---

## 6. O que pode ser reaproveitado

| Componente | Reuso |
|------------|--------|
| **`chat_kanban_scheduled_moves` + worker** | Base sólida para qualquer “faça X após tempo” no mesmo board. |
| **`kanbanInternalCardColumnPipeline`** | Ponto único para novos efeitos **ao entrar na coluna** se mantiver semântica atual. |
| **`parseKanbanPhase2` / rules / proposals** | Normalização incremental sem migrar dados antigos se parsers continuarem tolerantes. |
| **`applyKanbanAutomationForConversation`** | Padrão para novas origens de entrada (reason + query em `automation_config`). |
| **Auditoria em `chat_conversation_assignment_history`** | Padrão para observabilidade de novas ações. |
| **RLS / `beginKanbanTxWithRls`** | Segurança multi-tenant já encapsulada. |

---

## 7. O que precisa ser expandido (ideias, não compromisso)

- **Novos gatilhos:** mensagem recebida/enviada, inatividade, SLA — exigiriam integração com pipeline de mensagens ou jobs por conversa, fora do modelo atual “só coluna”.
- **Novas ações:** mover para **outro board**, duplicar cartão, múltiplos destinos — hoje o move automático é **intra-board** (coluna destino na mesma board na config Phase2).
- **Condições genéricas:** não há avaliador central; cada feature valida o seu subset.
- **Unificação conceitual:** taxonomia **Trigger → (Conditions) → Actions** alinhada ao código atual como **camada de documentação/UI**, sem obrigar refactor imediato.

---

## 8. Proposta de evolução incremental (fases)

### Fase 1 — Sem quebra

- Documentação viva (este ficheiro + links para ficheiros-chave).
- Pequenos alinhamentos UX (rótulos, tooltips) sem mudar schema.
- Garantir paridade UI/backend para unidades de tempo onde faltar.

### Fase 2 — Reorganização UX

- Agrupar configurações sob **“Automações”** com subtítulos: **Entrada no quadro**, **Ao entrar na coluna**, **Agendadas**, **Propostas**.
- Matriz legível “quando / o que faz” para suporte interno.

### Fase 3 — Novos gatilhos e ações

- Novos `reason` em `chatKanbanAutomationService` ou novos hooks já definidos em conversas/mensagens.
- Ações novas como mover entre boards: estender `kanbanScheduledMoveService` / pipeline com validações explícitas.

### Fase 4 — Engine avançada (opcional, longo prazo)

- Camada de regras versionada, condições, idempotência genérica — **apenas** se métricas de complexidade justificarem; manter parsers legados indefinidamente ou migrar gradualmente.

---

## 9. Validação sugerida (não executada neste documento)

- `npm run build` nos pacotes afetados após alterações futuras.
- Testes manuais ou E2E: mover cartão, timer, aceitar proposta, entrada automática, webhook.
- Confirmar `KANBAN_SCHEDULED_MOVE_POLL_MS` em ambientes de produção para latência aceitável dos timers.

---

## Referências rápidas de código

| Tema | Local principal |
|------|-----------------|
| Metadata Phase2 | `packages/backend/src/utils/kanbanPhase2.ts` |
| Regras coluna | `packages/backend/src/utils/kanbanColumnRules.ts` |
| Pipeline entrada coluna | `packages/backend/src/services/kanbanInternalCardColumnPipeline.ts` |
| Automações “pesadas” coluna | `packages/backend/src/services/kanbanColumnAutomationService.ts` |
| Entrada automática cartão | `packages/backend/src/services/chatKanbanAutomationService.ts` |
| Worker timers | `packages/backend/src/services/kanbanScheduledMoveService.ts`, `packages/backend/src/index.ts` |
| Proposta aceite | `packages/backend/src/services/proposalKanbanAcceptAutomationService.ts` |
| UI coluna | `src/components/chat-kanban/ChatKanbanColumnSettingsSheet.tsx` |

---

*Documento gerado para suportar decisões de produto e engenharia sem invalidar instalações existentes.*
