# Mapa técnico — Kanban do chat × Propostas

Este documento lista **arquivos e responsabilidades** para a evolução planejada (valor comercial no card, lead em propostas, configuração de coluna, automação ao aceitar). Serve como mapa de navegação para implementação futura.

---

## 1. Kanban (chat)

| Caminho | Responsabilidade |
|---------|------------------|
| `src/pages/ChatKanbanPage.tsx` | Página do quadro: estado de boards, colunas, cards; DnD; diálogos de motivo/confirmação de movimento. **Ponto para** carregar totais de propostas ou receber props enriquecidas. |
| `src/services/chatKanban.ts` | Cliente REST `/api/chat/kanban/*`; tipos `ChatKanbanBoard`, `ChatKanbanColumn`, `ChatKanbanBoardCard`. |
| `src/components/chat-kanban/ChatKanbanCard.tsx` | Render do cartão (avatar, título, preview, badges Cliente/Lead). **Ponto para** exibir valor pendente/aceito. |
| `src/utils/chatKanbanCardDisplay.ts` | Helpers de título, telefone, datas — pode ganhar helpers de formatação monetária para o card. |
| `src/components/chat-kanban/ChatKanbanSortableCard.tsx` | Wrapper sortable do card. |
| `src/components/chat-kanban/ChatKanbanColumnSettingsSheet.tsx` | UI extensa de configuração da coluna (metadata, phase2, funil, modelos WhatsApp, colunas para auto-move). **Ponto principal** para UI de “propostas na coluna”. |
| `src/utils/kanbanColumnRulesUi.ts` | Parse/merge de `metadata`: `kanban_column_ui`, `kanban_column_rules`, `kanban_phase2`. **Estender** com tipo `kanban_proposals` (ou nome acordado) + defaults de serialização. |
| `packages/backend/src/controllers/chatKanbanController.ts` | CRUD boards, colunas, cards; patch de card; integração com pipeline de coluna. |
| `packages/backend/src/services/kanbanInternalCardColumnPipeline.ts` | Efeitos ao entrar/sair de coluna — relevante para reutilizar em movimento automático por proposta. |
| `packages/backend/src/services/kanbanScheduledMoveService.ts` | Auto-move **por tempo**; padrão a estudar para enfileirar movimento por **evento** (proposta aceita). |
| `packages/backend/src/utils/kanbanPhase2.ts` | Parse/validação server-side de `kanban_phase2` no metadata. |
| `packages/backend/src/services/kanbanColumnAutomationService.ts` | Automações phase2 ao mover card. |
| `database/init/` + migrações `108_chat_kanban_scheduled_moves.sql` (referência em `migrate.ts`) | Esquema kanban; novas migrações se precisar de tabelas auxiliares (preferir metadata + serviço antes de nova tabela). |

---

## 2. Chat (conversa)

| Caminho | Responsabilidade |
|---------|------------------|
| `src/pages/Chat.tsx` | Modo `proposal-create`, `ProposalCreateForm` com `initialClientId` a partir da conversa. **Ajuste futuro:** passar `initialLeadId` / payload alinhado à API com `lead_id`. |
| `src/components/proposals/ProposalCreateForm.tsx` | Formulário único de criação (também usado em `/proposals/new` e lead popup). **Props** para defaults de funil/itens se vier do kanban. |

---

## 3. Propostas (API e domínio)

| Caminho | Responsabilidade |
|---------|------------------|
| `packages/backend/src/controllers/proposalsController.ts` | CRUD; `proposalSchema` / `proposalPatchSchema`; listagem com filtros. **Alterações:** `lead_id` no Zod e nas queries INSERT/SELECT; filtros `lead_id`. |
| `packages/backend/src/routes/proposalsRoutes.ts` | Rotas `/api/proposals`. |
| `src/services/proposals.ts` | Cliente frontend tipado; `getProposals(filters)`. **Estender** filtros e tipo `Proposal`. |
| `database/init/12_create_proposals.sql` | DDL base; **nova migration** para `lead_id`, CHECK, índice. |
| `packages/backend/src/services/proposalInvoiceConversionService.ts` | Conversão em fatura — **manter** exigência de `client_id`. |
| `packages/backend/src/services/proposalPublicAcceptHooks.ts` | Pós-aceite público; fatura automática se sem cliente — já alinhado ao plano. |
| `packages/backend/src/services/proposalTimelineService.ts` | Timeline de eventos — útil para auditoria de “card movido por aceite”. |

---

## 4. Faturamento

| Caminho | Responsabilidade |
|---------|------------------|
| `packages/backend/src/services/customerBillingService.ts` / `customerInvoiceService` | Criação de fatura manual; vínculo `proposal_id`. |
| UI em `ProposalDetails.tsx` / ações de “Gerar fatura” | Desabilitar ou orientar quando `client_id` ausente. |

---

## 5. Onde mexer — resumo por objetivo

| Objetivo | Chat | Kanban | Propostas | Faturamento |
|----------|------|--------|-----------|-------------|
| Valor no card | — | `ChatKanbanCard`, `ChatKanbanPage`, possivelmente novo endpoint agregador | — | — |
| Config coluna (pendente/aceito, mover ao aceitar) | — | `ChatKanbanColumnSettingsSheet`, `kanbanColumnRulesUi.ts`, validação backend ao `patchColumn` | — | — |
| Proposta para lead | `Chat.tsx`, `ProposalCreateForm` | Agregação por `conv_lead_id` | Controller + migration + `proposals.ts` | Sem mudança de regra central |
| Automação ao aceitar | — | Serviço que chama mesma lógica de `patch` de card | Hook após `status=accepted` | — |

---

## 6. Dependências externas ao mapa

- **`chat_conversations`:** deve expor `client_id` e `lead_id` nos JOINs já usados pelos cards (campos `conv_*` na listagem de cards).
- **Funil:** `sales_funnels` / `funnel_stages` — já ligados à proposta e opcionalmente à coluna do kanban (`funnel_stage_id`).

---

## 7. Documentos relacionados

- `docs/PLANO_KANBAN_CHAT_PROPOSTAS_VALOR_E_LEAD.md` — plano funcional e decisões.
- `docs/ETAPAS_KANBAN_CHAT_PROPOSTAS.md` — fases de implementação.
- `docs/MAPA_TECNICO_PROPOSTAS_ORCAMENTOS.md` — mapa legado do módulo propostas (pode estar parcialmente desatualizado na listagem UI).
