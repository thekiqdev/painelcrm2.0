# Etapas de implementação — Kanban/Chat com propostas (valor + lead)

Planejamento incremental; **cada etapa deve ser entregável e testável** antes da seguinte. Não substitui especificação detalhada de tickets.

---

## Etapa 1 — Modelo `lead_id` na proposta + API + chat

**Objetivo:** permitir que uma proposta referencie um **lead** com as mesmas garantias de tenant que `client_id`, preparando listagens e o kanban sem “inventar” oportunidades.

**Escopo técnico:**
- Migration: coluna `proposals.lead_id` (FK `leads`, `ON DELETE SET NULL`), índice; CHECK ou validação na API: não permitir `client_id` e `lead_id` simultâneos (exceto janela de migração se necessário).
- `proposalSchema` / PATCH / GET list: incluir `lead_id`; filtros de listagem.
- Frontend: tipo `Proposal` em `src/services/proposals.ts`; `ProposalCreateForm` + `Chat.tsx` preenchendo `lead_id` quando `selectedConversation.lead_id` e não houver cliente.

**Arquivos impactados (típicos):**  
`database/migrations/*`, `proposalsController.ts`, `proposalsRoutes.ts`, `src/services/proposals.ts`, `ProposalCreateForm.tsx`, `Chat.tsx`.

**Risco:** médio (mudança de BD + contrato API). Mitigação: migration reversível; default `NULL`; testes de create sem lead/cliente.

**Critério de aceite:**
- Criar proposta a partir de conversa só com lead grava `lead_id` e `client_id` null.
- Criar proposta com cliente grava `client_id` e não define `lead_id` indevidamente.
- Listagem permite filtrar por `lead_id` onde aplicável.

---

## Etapa 2 — Agregação de valores por conversa (backend + contrato)

**Objetivo:** obter **pendente** e **aceito** por `conversation_id` sem N+1 no browser.

**Escopo técnico:**
- Definir regra de status (ver plano: `sent` = pendente; `accepted` + opcionalmente `invoiced` = aceito conforme flag).
- Endpoint dedicado, por exemplo: `GET /api/chat/kanban/boards/:boardId/cards/proposal-summaries` retornando mapa `conversation_id` → `{ pendingTotal, acceptedTotal, currency }`, ou enriquecer resposta atual de cards se o controller já fizer JOIN pesado controlado.
- Testes de carga com volume típico de cartões por board.

**Arquivos impactados:**  
`chatKanbanController.ts` (+ possível novo serviço `kanbanProposalAggregationService.ts`), `chatKanban.ts` (frontend).

**Risco:** médio/alto (performance). Mitigação: uma query agregada com `GROUP BY`; índices em `proposals(client_id)`, `proposals(lead_id)`, `proposals(status)`.

**Critério de aceite:**
- Para um board com N cartões, **uma** chamada (ou payload enriquecido) devolve totais alinhados às propostas reais do tenant.
- Valores batem com soma manual em ambiente de teste.

---

## Etapa 3 — Exibir valor no card + respeitar configuração da coluna (somente leitura)

**Objetivo:** UX de valor comercial no kanban **sem** automação ainda.

**Escopo técnico:**
- Estender `metadata` da coluna com bloco `kanban_proposals` (ver plano): flags `display.pending_enabled`, `display.accepted_enabled`, etc.
- `ChatKanbanColumnSettingsSheet`: formulário para essas flags (defaults off).
- `ChatKanbanCard`: renderizar linhas “Pendente R$ …” / “Aceito R$ …” conforme coluna do card e flags.

**Arquivos impactados:**  
`kanbanColumnRulesUi.ts`, `ChatKanbanColumnSettingsSheet.tsx`, `ChatKanbanCard.tsx`, validação opcional no backend ao salvar coluna.

**Risco:** baixo se defaults preservarem UI atual.

**Critério de aceite:**
- Coluna com tudo desligado = cartão igual ao atual.
- Coluna com pendente/aceito ligados = valores corretos e legíveis.

---

## Etapa 4 — Automação: mover card ao aceitar proposta

**Objetivo:** quando proposta passa a `accepted`, mover o cartão da conversa vinculada para coluna configurada.

**Escopo técnico:**
- Flags `automation.move_on_accept`, `automation.target_column_id` no metadata (validar coluna no mesmo `board_id`).
- Hook centralizado ao gravar status `accepted` (API interna + fluxo público se aplicável): resolver card(s) ativo(s), aplicar movimento reutilizando pipeline de kanban (mesmas regras de permissão e efeitos colaterais).
- Feature flag (env ou config tenant) para ativar gradualmente.

**Arquivos impactados:**  
`proposalsController.ts` (ou serviço de domínio chamado após update), `kanbanInternalCardColumnPipeline`, possivelmente novo `proposalKanbanAutomationService.ts`, testes integrados.

**Risco:** alto (efeitos colaterais em atendimento). Mitigação: flag off por default; logs e timeline; idempotência (não mover duas vezes sem necessidade).

**Critério de aceite:**
- Com flag on e config válida, aceitar proposta move o cartão uma vez para a coluna destino.
- Com flag off ou config inválida, comportamento inalterado.

---

## Etapa 5 — Modelo / defaults por coluna na criação de proposta

**Objetivo:** ao criar proposta a partir do contexto “card nesta coluna”, aplicar funil/estágio e templates leves definidos na coluna.

**Escopo técnico:**
- Passar contexto da coluna (ids, templates) para `ProposalCreateForm` quando aberto do kanban ou do drawer da conversa ligado ao card.
- Não enviar automaticamente como `sent` salvo decisão explícita futura.

**Arquivos impactados:**  
`Chat.tsx`, `ChatKanbanPage.tsx` / drawer, `ProposalCreateForm.tsx`, metadata coluna.

**Risco:** baixo/médio (UX). Mitigação: revisão de produto nos textos default.

**Critério de aceite:**
- Usuário vê título/itens/funil pré-preenchidos de forma previsível ao criar a partir da coluna configurada.

---

## Ordem e dependências

```
Etapa 1 (lead_id) ──┐
                    ├──► Etapa 2 (agregação) ──► Etapa 3 (UI card + config leitura)
                    │                                      │
                    │                                      └──► Etapa 4 (automação aceite)
                    │                                                      │
Etapa 5 (defaults) ◄┴──────────────────────────────────────────────────────────┘
```

**Nota:** Etapa 5 pode começar em paralelo com Etapa 4 após Etapa 1 se os defaults não dependerem dos totais agregados.

---

## Referências

- `docs/PLANO_KANBAN_CHAT_PROPOSTAS_VALOR_E_LEAD.md`
- `docs/MAPA_TECNICO_KANBAN_CHAT_PROPOSTAS.md`
