# AUDIT_PHASE10C_CLOSEOUT — Runtime Ownership Unification

| Campo | Valor |
|---|---|
| **Sprint** | Phase 10C — Runtime Ownership Unification |
| **Tipo** | Investigation only |
| **Data** | 2026-07-14 |
| **Código alterado** | **Nenhum** |
| **Backend / Socket / Flags** | **Não alterados** |

---

## Veredito

**Não existe uma única Source of Truth end-to-end** para Instance → Conversation → Messages → UI.

Phase 10A/10B unificaram **Conversation lista** (e writes CRM/attendance) quando Domain Store ON.  
**Messages**, **Preview**, **Instance**, **Float header** e **Kanban** permanecem com owners distintos ou pipelines paralelos.

---

## Entregáveis

| Artefato | Status |
|---|---|
| `AUDIT_RUNTIME_OWNERSHIP_MAP.md` | OK (AUD-101) |
| `AUDIT_RUNTIME_READ_GRAPH.md` | OK (AUD-102) |
| `AUDIT_RUNTIME_WRITE_GRAPH.md` | OK (AUD-103) |
| `AUDIT_RUNTIME_MULTIPLE_SOURCES.md` | OK (AUD-104/105) |
| `AUDIT_RUNTIME_INSTANCE_FLOW.md` | OK (AUD-110) |
| `AUDIT_RUNTIME_MESSAGE_FLOW.md` | OK (AUD-106 Messages) |
| `AUDIT_RUNTIME_CONVERSATION_FLOW.md` | OK |
| `AUDIT_RUNTIME_DIVERGENCES.md` | OK (AUD-113/115) |
| `AUDIT_RUNTIME_DIAGRAM.md` | OK (AUD-114) |
| `AUDIT_PHASE10C_CLOSEOUT.md` | OK |

---

## Critérios de sucesso — respostas com evidência

| # | Pergunta | Resposta | Evidência |
|---|---|---|---|
| 1 | SoT única Instance? | **Não** | HTTP cache + Registry ± + Chat `useState` + Float `instanceIds` — `AUDIT_RUNTIME_INSTANCE_FLOW.md` |
| 2 | SoT única Conversation? | **Parcial** | Listas Store ON; Float header = RQ `conversation-meta` — Ownership Map / Conversation Flow |
| 3 | SoT única Messages? | **Parcial** | Store ON thread; OFF = RQ/local — Message Flow |
| 4 | Preview ≡ Thread mesma entidade? | **Não** | Preview = conversation row; Thread = messages[]; `appendMessage` ≠ preview — Message Flow AUD-106 |
| 5 | Floating ≡ Chat mesmos dados? | **Não** | Meta RQ Float; instance filter differences; CRM locals — Multiple Sources / Divergences |
| 6 | Kanban Conversation ou DTO? | **DTO paralelo** `conv_*` | Kanban Runtime / Divergences |
| 7 | Pipelines paralelos? | **Sim** | Read/Write graphs + Diagram |
| 8 | Estados duplicados? | **Sim** | Ownership Map “estado próprio” |
| 9 | HTTP→UI sem Store? | **Sim** | Float meta, Kanban, profiles, Store OFF — Multiple Sources AUD-105 |
| 10 | Arquitetura real hoje? | **Camadas coexistentes** (ver Diagram) | `AUDIT_RUNTIME_DIAGRAM.md` |

---

## Sintoma observado (reprodução arquitetural)

| Sintoma | Causa de ownership |
|---|---|
| Preview recente / Thread antiga ou vazia | Preview Writing ≠ Message hydrate / append |
| Floating ≠ Chat | Meta RQ + instanceIds + selection local |
| Conversa some no Float | Inbox replace com `instanceIds` diferentes |
| Header / preview / msgs “pipelines diferentes” | Conversation row + RQ meta + Message Store |

---

## Escopo explicitamente fora (próximo sprint)

Esta auditoria **não** implementa:

- Instance Runtime único lido por Chat/Float/Kanban  
- Float header 100% Store (remover meta paralelo)  
- Contrato Preview ↔ Thread (mirror on `message.created` ou invalidate preview)  
- Kanban on Domain Conversation  
- Remoção total path Store OFF  

Recomendação de implementação: sprint **Phase 10C Implementation** (ou 10D) com delta mínimo FE-only, sem alterar Socket/SQL/Redis/flags catalog defaults.

---

## Closeout

| Item | Valor |
|---|---|
| Investigation complete | **Sim** |
| Unique SoT end-to-end | **Não** |
| Diagram oficial real | `AUDIT_RUNTIME_DIAGRAM.md` |
| Código tocado | **0** |
