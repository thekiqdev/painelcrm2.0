# PHASE10B_CLOSEOUT — Conversation Runtime Unification

| Campo | Valor |
|---|---|
| **Phase** | 10B |
| **Data** | 2026-07-14 |
| **Gate** | **CLOSED** |
| **Tipo** | Arquitetura + Runtime Hardening (frontend only) |

---

## Resumo

Conversation passa a ter pipeline único **HTTP/Socket → normalize → Domain Store → selectors → UI** para Chat e Floating com Store ON. Writes legados do Chat (`setConversations`) alimentam a Store; CRM Floating escreve via `applyStoreConversationPartialPatch`; WS deixa de fazer double-adapt; métricas/divergence em DEV.

## MB

| MB | Status |
|---|---|
| 061 Pipeline audit | Done — `PHASE10B_RUNTIME_PIPELINE.md` |
| 062 Field sources | Done — `PHASE10B_STORE_AUDIT.md` |
| 063–064 Normalizers | Done — `PHASE10B_NORMALIZATION_REPORT.md` |
| 065–071 SoT surfaces | Done (Chat/Float); Kanban board residual |
| 072 Messages/preview | Alinhados via mesma row Store |
| 073–074 Socket/HTTP | Store-first documentado + wired |
| 075 SoT doc | Done |
| 076 Metrics | Done — `conversationRuntimeMetrics.ts` |
| 077 QA | Done |
| 078 Closeout | Este |

## Arquivos principais

| Arquivo | Mudança |
|---|---|
| `Chat.tsx` | `setConversations` → `applyStoreConversationsUiUpdate` |
| `consolidation.ts` | PartialPatch + metrics hooks |
| `public.ts` | export PartialPatch |
| `eventAppliers.ts` | 1× mapLegacy |
| `domainToUi.ts` / `domainMappers.ts` | divergence + counters |
| Floating Window/CompactProfile | CRM → Store |
| `conversationRuntimeMetrics.ts` | MB-076 |

## Restrições

Sem Backend/SQL/Redis/Workers/Socket protocol/Flags/ADR/contratos Domain públicos.

## Residuais aceitos

1. Kanban **board** `listCards` (`conv_*`) — projeção própria.  
2. Floating `conversation-meta` RQ — cache de header.  
3. Store OFF — dual path por feature flag (não alterável nesta sprint).

## Aceite (operações Store ON)

| Critério | Status |
|---|---|
| Uma SoT Conversation Chat/Float | **Pass** |
| Writes Chat não no-op | **Pass** |
| Sem double-adapt WS | **Pass** |
| CRM altera Store | **Pass** |
| UI deriva selectors | **Pass** |
| Kanban board = mesma entidade ChatConversation | **N/A residual** (DTO board) |

## Veredito

**PHASE 10B → CLOSED** com residual Kanban board / meta RQ / Store OFF explicitamente documentados.
