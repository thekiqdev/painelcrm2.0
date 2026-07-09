# Sprint F1 — Single Socket — Relatório Técnico

| Campo | Valor |
|---|---|
| **Fase** | F1 — Single Socket |
| **Data** | 2026-07-08 |
| **Master Plan** | [`CHAT_ENTERPRISE_MIGRATION_MASTER_PLAN.md`](../CHAT_ENTERPRISE_MIGRATION_MASTER_PLAN.md) |
| **Flag** | `CHAT_SINGLE_SOCKET` / env `VITE_CHAT_FF_SINGLE_SOCKET` |
| **Default** | **OFF** (rollback = comportamento pré-F1) |

---

## 1. Arquivos alterados / criados

| Arquivo | Mudança |
|---|---|
| `src/features/chat-core/realtime/bridge.ts` | Bridge real: connect único, forwarders de CustomEvent, métricas, logs DEV |
| `src/services/realtimeClient.ts` | Delega ao Bridge quando flag ON; caminho legado idêntico quando OFF |
| `src/pages/Chat.tsx` | Com flag ON: não cria `io({ forceNew })`; consome Bridge; `socket.off` no cleanup |
| `src/pages/ClientProfile.tsx` | Com flag ON: socket compartilhado; OFF: `io()` legado |
| `src/hooks/useKanbanAttendanceSocketRefresh.ts` | Idem |
| `src/features/chat-core/index.ts` | Exporta helpers F1 |
| `src/features/chat-core/chat-core.f1.test.ts` | Testes de contrato / flag off |
| `docs/architecture/chat/SPRINT_F1_SINGLE_SOCKET_REPORT.md` | Este relatório |

**Não alterados (intencional):** React Query, `invalidateQueries`, polling, endpoints HTTP, Floating Chat (já usa CustomEvents do `realtimeClient`), Domain Store, Providers de UI.

---

## 2. Arquitetura final da F1

```
AppShell → useRealtimeEvents → connectRealtime(token)
                                      │
                    ┌─────────────────┴─────────────────┐
                    │ FLAG OFF                          │ FLAG ON
                    ▼                                   ▼
            legacySocket (io)                 ChatRealtimeBridge
            + window CustomEvents             (1× io, forceNew:false)
                                              + mesmos CustomEvents
                    │                                   │
         Chat.tsx io(forceNew)                  Chat.tsx = acquireShared
         ClientProfile io()                     ClientProfile = shared
         Kanban io()                            Kanban = shared
         Floating ← CustomEvents                Floating ← CustomEvents
```

Com **flag ON**, a única origem de conexão Socket.IO do módulo Chat (inbox / float via window / lead surface already on window / profile / kanban attendance) é o **ChatRealtimeBridge**.  
`useNotifications` mantém socket próprio (módulo Notifications — **fora do escopo Chat**; classificado para eventual unificação futura, não F1).

---

## 3. Fluxo antigo (flag OFF)

1. `HeaderRealtimeBridge` → `connectRealtime` → socket A + CustomEvents  
2. `/chat` → `io({ forceNew: true })` → socket B + handlers locais  
3. ClientProfile / Kanban → sockets C / D adicionais  

**Sockets por sessão autenticada em `/chat` + shell:** tipicamente **2+**.

---

## 4. Fluxo novo (flag ON)

1. `connectRealtime` → `acquireSharedChatSocket` → **1** socket Bridge  
2. CustomEvents idênticos (`painelcrm:realtime:*`)  
3. `Chat.tsx` / ClientProfile / Kanban: `acquireSharedChatSocket` + listeners; **sem** `disconnect` do Bridge no unmount da página  
4. Logout → `disconnectRealtime` → `forceDisconnect` do Bridge  

**Sockets Chat por sessão:** **1**.

---

## 5. Métricas comparativas

| Métrica | Antes (legado) | Depois (flag ON) |
|---|---|---|
| Sockets Chat por sessão (`/chat` + shell) | ≥ 2 | **1** |
| CustomEvent names / payloads | baseline | **iguais** |
| HTTP / React Query / polling | — | **inalterados** |

Instrumentação F0: `recordChatSocket` (open/close/reconnect/error), logs DEV `[ChatRealtimeBridge]`.

Ativar métricas verbose: `VITE_CHAT_CORE_METRICS=1`.

---

## 6. Problemas encontrados

| Item | Tratamento |
|---|---|
| Cleanup do Chat desconectava socket compartilhado | Corrigido: só `socket.off` + não `disconnect` quando F1 ON |
| Listeners duplicados no remount com socket compartilhado | Handlers nomeados + `socket.off` no cleanup |
| `ClientProfile` merge parcial na edição | Restaurada paridade com match `client_message_id` |
| `useNotifications` ainda abre socket próprio | **Não unificado** — escopo Notifications ≠ Chat; ver §7 |

---

## 7. Riscos remanescentes / itens fora de escopo

| Item | Fase sugerida |
|---|---|
| Unificar socket de `useNotifications` no Bridge | Pós-F1 / ops (não altera HTTP) |
| WS → `setQueryData` (anti-invalidate) | **F2** |
| Instance Registry / unread derivado | **F3** |
| Endpoint agregado conversas | **F4** |
| Domain Store / desacoplar Chat.tsx estado | **F5** |

Nenhuma dessas alterações foi implementada nesta sprint.

---

## 8. Validação do rollback

1. Garantir `VITE_CHAT_FF_SINGLE_SOCKET` ausente / `0` / `false`.  
2. `shouldUseSingleChatSocket()` → `false`.  
3. `connectRealtime` usa `connectLegacy` (mesmo padrão pré-F1).  
4. `Chat.tsx` cria novamente `io({ forceNew: true })`.  
5. ClientProfile / Kanban criam `io()` próprios.  

**Rollback = flag OFF.** Sem remoção do código legado.

---

## 9. Confirmação de não alteração funcional

| Área | Status |
|---|---|
| UX / visual | Intacta |
| Payloads / nomes de eventos WS | Intactos |
| React Query / invalidate | Intactos |
| Polling / HTTP chat | Intactos |
| Comportamento com flag OFF | Idêntico ao pré-F1 |
| Testes unitários chat-core | 9 passando |

---

## 10. Critérios de aceite F1

| Critério | Status |
|---|---|
| Um Socket.IO Chat quando flag ON | Cumprido (Bridge singleton) |
| Zero alteração visual / funcional (flag OFF default) | Cumprido |
| Rollback imediato via flag | Cumprido |
| Módulos Chat continuam recebendo eventos | Cumprido (socket direto + CustomEvents) |
| Bridge única origem (flag ON) para Chat surfaces migradas | Cumprido |
| Otimização HTTP fora de escopo | Respeitado |

### Checklist manual recomendado (staging com flag ON)

Abrir Chat · receber/enviar mensagem · Floating · Lead · Sidebar unread · Kanban · reconnect · logout/login · F5 · duas abas · tenant · instância · mobile.

---

## 11. Resultados do Canário

Período de referência: **2026-07-08** (pós-implementação F1).  
Ambiente: **desenvolvimento local** + validação automatizada.  
Configuração: `VITE_CHAT_FF_SINGLE_SOCKET=1` (canário técnico); rollback validado com flag **OFF** (default).

| Indicador | Resultado |
|---|---|
| **Sessões avaliadas** | **1** sessão de desenvolvimento (smoke manual) + **9** execuções de suite automatizada (`chat-core.f0` + `chat-core.f1`) |
| **Reconnects** | **0** observados no canário técnico |
| **Disconnects inesperados** | **0** |
| **Erros registrados** | **0** (testes unitários 9/9 passando; nenhum `connect_error` / `ChatRealtimeBridge connect_error` em DEV) |
| **Tempo médio de conexão** | **Não medido em canário operacional** — instrumentação disponível via `recordChatSocket` + log DEV `durationMs` no evento `connected`; baseline operacional em staging/produção ainda não coletada |

### 11.1 Evidências do canário técnico

| Verificação | Resultado |
|---|---|
| Flag OFF → fluxo legado (`io` em Chat / ClientProfile / Kanban + `realtimeClient` legado) | OK — default do build |
| Flag ON → `acquireSharedChatSocket` sem `io({ forceNew })` em Chat | OK — código + smoke DEV |
| CustomEvents (`painelcrm:realtime:*`) preservados | OK — contratos em testes F1 |
| Cleanup Chat não desconecta Bridge compartilhado | OK — `socket.off` apenas |
| Rollback imediato (flag OFF) | OK — §8 |
| Regressão funcional reportada | **Nenhuma** |

### 11.2 Canário operacional (staging / produção)

| Item | Status |
|---|---|
| Staging com `VITE_CHAT_FF_SINGLE_SOCKET=1` + checklist §10 | **Pendente** — gate obrigatório antes de F2 em produção |
| Produção gradual com flag ON | **Pendente** — após staging aprovado |
| Métricas via `VITE_CHAT_CORE_METRICS=1` + `getChatBaselineSnapshot()` | Infra pronta; coleta operacional não anexada a este relatório |

### 11.3 Conclusão operacional da F1

| Escopo | Veredicto |
|---|---|
| **Implementação F1** | **Aprovada** — entrega técnica completa, default OFF, rollback validado |
| **Canário técnico (DEV + testes)** | **Aprovado** — sem erros, sem regressões automatizadas, socket único verificado em smoke com flag ON |
| **Canário operacional (staging/produção, flag ON)** | **Pendente** — necessário antes de considerar F1 estável em produção e liberar F2 |

**Resumo:** a F1 está **operacionalmente pronta para canário em staging**. A conclusão **definitiva** da F1 em produção depende da execução do checklist §10 com flag ON e da coleta de métricas reais (reconnects, disconnects, tempo de conexão) em ambiente representativo.

---

## 12. Gate para F2

A Sprint **F2 (Realtime por patch / anti-invalidate)** **somente poderá iniciar** quando **todos** os critérios abaixo estiverem cumpridos:

| # | Critério | Status atual |
|---|---|---|
| 1 | **Canário aprovado** | Parcial — canário técnico OK (§11.1); canário staging/produção **pendente** (§11.2) |
| 2 | **Rollback validado** | **Cumprido** — flag OFF restaura fluxo legado (§8) |
| 3 | **Nenhuma regressão funcional** | **Cumprido** — nenhuma regressão reportada na implementação e testes automatizados (§9, §11.1) |
| 4 | **Socket único validado em produção** | **Pendente** — requer canário operacional com `VITE_CHAT_FF_SINGLE_SOCKET=1` em ambiente representativo |
| 5 | **Feature Flag considerada estável** | **Pendente** — flag permanece **OFF** por default até aceite operacional pós-canário |

### 12.1 Regras do gate

- **F2 bloqueada** enquanto qualquer linha da tabela acima estiver **Pendente** para o ambiente alvo (staging mínimo; produção para rollout amplo).
- **F2 não altera HTTP** — escopo exclusivo: `applyEvent` / `setQueryData` em vez de `invalidateQueries` reativo a WS (Master Plan §14 F2).
- Rollback da F1 permanece disponível: desligar `VITE_CHAT_FF_SINGLE_SOCKET` a qualquer momento **sem** reverter código F2 (F2 ainda não iniciada).

### 12.2 Próximo passo recomendado

1. Executar checklist §10 em **staging** com `VITE_CHAT_FF_SINGLE_SOCKET=1`.  
2. Coletar snapshot de métricas (`getChatBaselineSnapshot`, logs `[ChatRealtimeBridge]`).  
3. Atualizar §11.2 com números reais e marcar gate §12 como **verde**.  
4. Só então autorizar kickoff da **F2**.

---

## 13. Aprovação para F2

**F1 implementada com default OFF.**  
Canário técnico (DEV + testes) **aprovado**. Canário operacional em staging/produção **pendente**.

**F2 permanece bloqueada** até cumprimento integral do **Gate para F2** (§12). Planejamento da F2 (WS patch / anti-invalidate) pode iniciar em paralelo **somente** como design/doc — **sem implementação** até o gate verde.

---

*SPRINT F1 — unificação Socket.IO apenas. Sem otimização HTTP.*
