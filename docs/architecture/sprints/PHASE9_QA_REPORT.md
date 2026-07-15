# PHASE9_QA_REPORT — MB-050

| Campo | Valor |
|---|---|
| **Sprint** | Phase 9 |
| **Data** | 2026-07-14 |
| **Tipo** | Auditoria runtime (código + testes unitários) |

## Matriz de validação

| Cenário | Depende de polling contínuo? | Mecanismo pós-P9 | Resultado |
|---|---|---|---|
| Login | Não | Bootstrap HTTP 1× + Socket | **OK** |
| Logout | Não | clear caches / RQ | **OK** |
| Refresh (F5) | Não | Bootstrap de novo | **OK** |
| Nova mensagem | Não | Socket → Store/engine | **OK** |
| Mensagem enviada | Não | Socket / optimistic + WS | **OK** |
| Mensagem recebida | Não | Socket unread+patch | **OK** |
| Mensagem lida | Não | attendance/conversation WS | **OK** |
| Floating Chat | Não | Bridge + pulse UI sem HTTP | **OK** |
| Client Profile | Não | Sem poll Chat adicionado | **OK** |
| Kanban Chat | Não | Interval 20s removido | **OK** |
| Dashboard ops / SLA | Não | 1× sessão + manual | **OK** |
| Attendance counts | Não | Socket + login; sem interval | **OK** |
| Unread nav | Não | Engine + Socket; 120s removido | **OK** |
| CRM superfícies Chat | Não | Sem auto GET periódico | **OK** |
| Troca de instância | Não | Manual patch + load | **OK** |
| Arquivar / desarquivar | Não | Ação + HTTP pós-ação (manual) | **OK** |

## Evidência automática

| Check | Resultado |
|---|---|
| `zeroPollingMetrics.test.ts` | Pass (2) |
| `chat-core` suite (~230 tests) | 230 pass; 1 fail pré-existente `chat-core.f0` phase string `F6.6` vs `F5.7` (**fora** Phase 9) |
| Grep Chat `setInterval` HTTP | Nenhum em `Chat.tsx` / `ChatKanbanPage` / unread bootstrap periódico |

## Critérios de aceite

| Critério | Status |
|---|---|
| Zero polling contínuo Chat | **Pass** |
| Zero timers GET periódicos Chat | **Pass** |
| Zero refetch automático desnecessário (RQ Chat path) | **Pass** (defaults globais off) |
| Updates via Socket / webhook path / manual | **Pass** |
| Endpoints estáticos em cache sessão | **Pass** (instances + company) |
| Store atualizada por eventos (SoT path) | **Pass** (sem GET pós-evento conversa) |
| Sem regressão funcional intencional | **Pass** (comportamentos preservados; só transport) |

## Resíduos documentados

- Floating 500ms pulse: UI only (**KEEP**).
- Pollers não-Chat (tickets, notifications, QR, payments): fora de escopo.
- `scheduleChatAttendanceReconcile` permanece exportado sem call sites FE.
