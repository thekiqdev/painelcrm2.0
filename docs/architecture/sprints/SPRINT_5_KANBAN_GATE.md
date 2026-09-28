# SPRINT_5 — Phase 10K-GATE · Kanban Runtime Decision

| Campo | Valor |
|---|---|
| **Sprint** | 5 |
| **Phase** | 10K-GATE |
| **Tipo** | Decisão arquitetural (sem implementação de unificação) |
| **Data** | 2026-07-15 |
| **Comando** | `ok sprint 5` |
| **Plano** | `PLAN_RUNTIME_OWNERSHIP_CLOSURE.md` |

## Pergunta do gate

O board Kanban deve:

| Opção | Significado |
|---|---|
| **A** | Permanecer **projeção de produto** (`listCards` / DTO `conv_*`), fora do Domain Store Chat/Float |
| **B** | Ser unificado à Conversation Domain Store (nova sprint + ADR) |

## Evidências (pré-decisão)

| Fonte | Achado |
|---|---|
| Phase 10B closeout | Board = residual explícito `conv_*` |
| Phase 10C audit | Kanban = DTO paralelo; impacto Alto se misturado no SoT |
| Review arquitetural pós-10C | Unificar Kanban **não** cura Preview/Header/Instance |
| Código | `ChatKanbanCard` consome `conv_last_message_*`, `conv_client_id`, etc. — shape de board, não `ChatConversation` UI |
| Sprints 1–4 | SoT Chat/Float Instance→Header→Open→CRM detail fechado sem precisar do Kanban |

## Critérios de decisão

1. Blast radius / risco de regressão no board  
2. Valor para sintomas Chat/Float (Preview, Thread, Instance, Header)  
3. Congelamentos ADR / Domain Store / API Kanban  
4. Momento (canário Store ON ainda pendente para Phase 11)

## Decisão

Ver `SPRINT_5_CLOSEOUT.md`.
