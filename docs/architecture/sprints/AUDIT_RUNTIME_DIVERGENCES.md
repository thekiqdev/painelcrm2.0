# AUDIT_RUNTIME_DIVERGENCES — AUD-113 + AUD-115

| Campo | Valor |
|---|---|
| **Auditoria** | Phase 10C — Runtime Ownership |
| **Data** | 2026-07-14 |
| **Nota** | Substitui o foco desta trilha para ownership SoT. Residual HTTP Phase 9 permanece em `AUDIT_PHASE9_RUNTIME_HTTP_RESIDUAL.md` / histórico. |

## Matriz (AUD-113)

| Entidade | Owner esperado | Owner real | Divergência | Impacto |
|---|---|---|---|---|
| Instance | Registry único | HTTP cache + Registry ± + UI local ×2 | **Alta** | Float vs Chat filtros / listas |
| Conversation lista | Domain Store | Domain Store (ON) | **Baixa** (ON) | — |
| Conversation header Float | Domain Store | RQ `conversation-meta` | **Alta** | Meta/header ≠ lista |
| Messages thread | Message Store | Message Store (ON) / RQ OFF | **Média** OFF | Dual path |
| Preview | Derivado Messages ou Conv unificada | Só Conversation row | **Alta** | Preview ≠ Thread |
| Selection | Runtime Store / shared | useState / panels | **Média** | IDs locais |
| Unread | Unread Engine + Store | Engine + field + sync | **Baixa–Média** | Contagens |
| Attendance | Conversation Store + Engine | Store + Engine + HTTP residual | **Média** | Kanban refresh |
| CRM Lead/Client detail | Conversation + profile cache | Local Chat state + RQ Float | **Média** | Chat vs Float CRM |
| Kanban board | Conversation proj. | `listCards` DTO | **Alta** | Parallel product surface |
| Avatar / identity | Conversation | Helpers + identity RQ + CRM | **Média** | Header drift |

---

## AUD-115 — Root Cause

### Existe uma única Source of Truth end-to-end?

# **NÃO**

### Onde nasce a duplicidade

1. **Instance** — múltiplos caches/listas locais pós-`ensureChatInstances`.  
2. **Conversation meta Float** — HTTP `findChatConversationById` paralelo ao Store.  
3. **Preview vs Messages** — dois slices sem contrato de sincronização no `appendMessage`.  
4. **Kanban** — DTO `conv_*` fora do Domain Store.  
5. **Flag OFF** — caminhos local/RQ ainda vivos.

### Quem escreve paralelo

- `FloatingConversationWindow` RQ meta.  
- `Chat.tsx` / `FloatingChatProvider` instance state.  
- Socket → Conversation **ou** Messages (não ambos no mesmo applier).  
- `ChatKanbanPage` cards state.  
- CRM GET → `currentLead` / `currentClient`.

### Quem lê paralelo

- Float header (RQ).  
- Chat/Float lists (Store ON) vs Kanban (DTO).  
- Preview (conversation) vs Thread (messages).  
- Instance enabled Set (Chat) vs instanceIds (Float).

### Componente que quebra a arquitetura “única”

Não é um único bug — é **coexistência intencional**:

| Camada | Quebra |
|---|---|
| `useFloatingConversationMessages` + Conversation Store | Messages ≠ Preview |
| `FloatingConversationWindow` conversation-meta | Header ≠ Store |
| Instance UI state dual | Visibility ≠ único registry |
| `ChatKanbanPage` | Produto paralelo |

---

## Respostas critérios de sucesso (resumo)

| # | Pergunta | Resposta |
|---|---|---|
| 1 | SoT Instance? | **Não** |
| 2 | SoT Conversation? | **Parcial** (lista ON sim; Float header não) |
| 3 | SoT Messages? | **Parcial** (ON sim; OFF não) |
| 4 | Preview ≡ Thread? | **Não garantido** |
| 5 | Float ≡ Chat dados? | **Não** (meta RQ, instances, CRM) |
| 6 | Kanban mesma entidade? | **Não** — DTO paralelo |
| 7 | Pipelines paralelos? | **Sim** |
| 8 | Estados duplicados? | **Sim** |
| 9 | HTTP→UI sem Store? | **Sim** (meta, Kanban, profiles, OFF) |
| 10 | Arquitetura real? | Runtime **em camadas coexistentes** — ver `AUDIT_RUNTIME_DIAGRAM.md` |
