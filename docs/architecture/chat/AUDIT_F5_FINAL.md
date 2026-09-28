# AUDIT F5 FINAL — Certificação de Arquitetura Chat Enterprise

| Campo | Valor |
|---|---|
| **Documento** | AUDIT_F5_FINAL |
| **Tipo** | Auditoria read-only (certificação) |
| **Versão** | 1.0 |
| **Data** | 2026-07-09 |
| **Fase certificada** | F5 — Domain Store como Source of Truth |
| **Próxima fase** | F7 — Redis WS & Legacy Removal (F6 certificada — ver AUDIT_F6) |
| **Modo** | Investigação estática + suite automatizada (sem alteração de código) |

---

## Objetivo

Certificar oficialmente a conclusão da Fase F5 do Chat Enterprise, validando que:

1. O **Domain Store** é a única Source of Truth quando `CHAT_CORE_STORE=ON`.
2. Não existem **pipelines paralelos ativos** de hidratação/realtime nas superfícies principais (Chat + Floating).
3. A arquitetura está **pronta para iniciar F6**.

---

## Veredito final

### **GO condicionado para F6**

| Critério | Resultado |
|---|---|
| Domain Store certificado como SoT (Chat + Floating, flag ON) | ✅ |
| Commands certificados como pipeline único de hidratação | ✅ |
| Realtime certificado como dispatcher único de dados (Bridge → Store) | ✅ |
| Bypass arquitetural em superfícies principais | ✅ Nenhum ativo |
| Bypass em superfícies satélite (Kanban, Lead embed, ClientProfile) | ⚠️ Documentado — não bloqueante F6 |
| Regressão funcional | ⚠️ Requer validação manual UX (checklist §12) |
| Suite automatizada store | ✅ **110/110** testes passando |
| Métricas runtime HTTP/React | ⚠️ Não medidas nesta auditoria (§7–8) |

**Condições para GO pleno:**

1. Canário em staging/prod com **`CHAT_CORE_STORE=ON`** + **`CHAT_SINGLE_SOCKET=ON`** (recomendado).
2. Checklist manual §12 executado sem regressões.
3. Superfícies satélite tratadas como escopo F6+ ou sprint de hardening opcional (não bloqueiam cursor/virtualização).

---

## Arquitetura certificada F5

```mermaid
flowchart TB
  subgraph HTTP["Pipeline HTTP (hidratação)"]
    R[Repository / chatService]
    LI[loadInboxCommand]
    LM[loadMessagesCommand]
    DS[(Domain Store)]
    R --> LI --> DS
    R --> LM --> DS
  end

  subgraph WS["Pipeline Realtime"]
    SIO[Socket.IO]
    BR[ChatRealtimeBridge.subscribe]
    SYNC[syncStoreFromSocketEvent]
    RED[Reducers]
    SIO --> BR --> SYNC --> RED --> DS
  end

  subgraph UI["Leitura UI"]
    HK[Hooks useSyncExternalStore]
    SEL[Selectors]
    DS --> SEL --> HK --> UI[Chat.tsx / Floating]
  end

  subgraph CMD["Mutations"]
    CC[chatCoreCommands]
    CC --> R
    CC --> DS
  end
```

**Rollback:** `CHAT_CORE_STORE=OFF` → `useState` + React Query + WS patch + invalidateQueries legados permanecem intactos.

---

## 1. Domain Store

### 1.1 Source of Truth

| Flag | Comportamento |
|---|---|
| `CHAT_CORE_STORE=ON` | Store é SoT; UI lê via hooks; `setConversations`/`setMessages` em Chat.tsx são **no-op** |
| `CHAT_CORE_STORE=OFF` | `useState` + React Query + cache legado |

Gate central:

```695:704:src/pages/Chat.tsx
  const setConversations = useCallback((action: React.SetStateAction<ChatConversation[]>) => {
    if (isChatStoreSourceOfTruth()) return;
    setConversationsState(action);
  }, []);
  // ...
  const setMessages = useCallback((action: React.SetStateAction<ChatMessage[]>) => {
    if (isChatStoreSourceOfTruth()) return;
    setMessagesState(action);
  }, []);
```

### 1.2 Singleton

| Item | Status |
|---|---|
| Instância única por sessão | ✅ `session.ts` — lazy create em `getChatDomainStoreSession()` |
| Múltiplos stores globais | ❌ Não detectados |
| Factory isolada para testes | ✅ `createChatDomainStore()` + `setChatDomainStoreSessionForTests()` |

### 1.3 Reducers ativos

Implementados em `reduceChatDomainState` (`store/actions.ts`):

| Action type | Função |
|---|---|
| `conversations/set` | Replace inbox (hidratação F5.9) |
| `conversations/upsert` | Patch linha (realtime / commands) |
| `conversations/remove` | Delete conversa |
| `messages/set` | Replace thread (hidratação F5.10) |
| `messages/append` | Nova mensagem WS |
| `messages/update` | Status/read/delivery |
| `messages/remove` | Delete mensagem |
| `messages/prepend` | Reservado F6 (load-more) |
| `messages/setCursor` | Reservado F6 |
| `selection/setConversation` | Seleção ativa |
| `loading/setConversations` | Loading inbox |
| `loading/setMessages` | Loading thread |
| `unread/set` | Contadores |
| `connection/set` | Estado WS |
| `instances/set` | Registry |
| `ui/patch` | UI efêmera store |
| `hydrate/partial` | Bootstrap parcial |
| `store/reset` | Reset sessão |
| `commands/begin\|confirm\|rollback` | Optimistic commands F5.5 |

### 1.4 Subscriptions

| Hook | Mecanismo | Métrica |
|---|---|---|
| `useChatConversationList` | `useSyncExternalStore` + `store.subscribe` | `recordStoreSubscription` |
| `useChatMessages` | idem | idem |
| `useChatSelection` | idem | idem |
| `useFloatingConversationListData` | idem | idem |
| `useFloatingConversationMessages` | idem | idem |

**Total hooks store-aware:** 5. Cada mount de componente que usa estes hooks cria 1 subscription ao store singleton.

### 1.5 Selectors

| Selector | Uso |
|---|---|
| `selectConversations` | Lista inbox |
| `selectMessages` | Thread |
| `selectConversation` | Linha individual |
| `selectSelectedConversation` | Conversa ativa |
| `selectUnread` | Badge/contadores |
| `selectConnection` | Diagnóstico WS |
| `selectInstances` | Filtro instâncias |
| `selectLoadingConversations` | Skeleton lista |

---

## 2. Commands

### 2.1 Mapa completo `chatCoreCommands`

| Command | Escrita Store | HTTP |
|---|---|---|
| `loadInbox` | `conversations/set` via `loadInboxCommand` | `listChatConversations` |
| `clearInbox` | `conversations/set([])` | — |
| `loadMessages` | `messages/set` via `loadMessagesCommand` | `delegatingChatRepository.getMessages` |
| `sendMessage` | optimistic + confirm/rollback | `chatService.sendText` |
| `markMessageRead` | via sync | API read |
| `markConversationRead` | via sync | API read |
| `assignConversation` | upsert | API assign |
| `transferConversation` | upsert | API transfer |
| `archiveConversation` | upsert | API archive |
| `closeConversation` | upsert | API close |
| `reopenConversation` | upsert | API reopen |
| `deleteConversation` | remove | API delete |
| `pinConversation` | upsert | API pin |
| `unpinConversation` | upsert | API unpin |
| `updateConversationStatus` | upsert | API status |

### 2.2 Pipeline Inbox (F5.9)

| Superfície | Command | Escrita alternativa |
|---|---|---|
| Chat `/chat` | `loadInboxCommand({ surface: 'chat', ... })` | ❌ Nenhuma (store ON) |
| Floating lista | `loadInboxCommand({ surface: 'float', ... })` | ❌ Nenhuma (store ON) |
| Bootstrap | `loadInboxCommand({ surface: 'bootstrap' })` | Só se `instanceIds` passados |
| UI direta | `applyStoreConversationList` | ❌ Removido da API pública UI |
| `syncStoreFromCommandResult('listConversations')` | — | No-op + DEV warn |

### 2.3 Pipeline Messages (F5.10)

| Superfície | Command | Escrita alternativa |
|---|---|---|
| Chat thread | `loadMessagesCommand(conversationId)` | ❌ Nenhuma (store ON) |
| Floating thread | `loadMessagesCommand(conversationId)` | ❌ Nenhuma (store ON) |
| `chatCore.syncMessages()` | `loadMessagesCommand` pós-sync | ✅ Unificado |
| Branch `surface: 'core'\|'float'` | — | ❌ Removido |

### 2.4 Carregamento paralelo detectado

| Origem | Condição | Impacto |
|---|---|---|
| `useFloatingConversationMessages` React Query | `CHAT_CORE_STORE=OFF` | Legado esperado |
| `Chat.tsx` `chatService.getConversationMessages` | flag OFF | Legado esperado |
| `chatPrefetch.ts` | Prefetch sidebar/bubble | Paralelo ao store se ambos correrem — best-effort, não escreve store |
| Bootstrap login vs Chat mount | Bootstrap sem `instanceIds` → sem hydrate inbox | ✅ Sem duplicata inbox |

---

## 3. Repository / HTTP

### 3.1 Caminhos HTTP do Chat Core (flag ON)

| # | Endpoint (via) | Origem | Escreve Store? |
|---|---|---|---|
| 1 | `GET /api/chat/instances` | Chat mount, bootstrap | Via sync instances (auxiliar) |
| 2 | `GET aggregated conversations` | `loadInboxCommand` → `listChatConversations` | ✅ Sim |
| 3 | `GET attendance-counts` | `fetchChatAttendanceCounts` | Auxiliar (UI counts) |
| 4 | `GET .../messages` | `loadMessagesCommand` | ✅ Sim |
| 5 | `POST syncConversationMessages` | fire-and-forget pós-get messages | Não (sync remoto) |

### 3.2 Bypass direto (exceções restantes)

| Artefato | Local | Bloqueante F6? |
|---|---|---|
| `getConversations` loop N+1 | `delegatingChatRepository` fallback | ⚠️ Só se aggregated OFF |
| `fetchMergedChatConversations` | `lib/chatConversationsFetch.ts` | ⚠️ Fallback repository |
| `MinimizedChatDock` loop instâncias | `MinimizedChatDock.tsx` | Não (dock meta) |
| `EmbeddedLeadConversationPanel` | Lead embed | Não (escopo CRM) |
| `ChatKanbanAddCardDialog` | Kanban | Não |
| `ChatKanbanConversationDrawer` | `getConversationMessages` direto | Não |
| `chatPrefetch` messages | Prefetch idle | Não (cache RQ) |
| `InstanceDetailsDialog` | Settings admin | Não (escopo settings) |

### 3.3 Estimativa HTTP ao abrir `/chat` (store ON, aggregated ON)

| Request | Qtd esperada | Notas |
|---|---|---|
| Migration flags | 0–1 | Cache painel |
| Instances | 1 | Registry F3 ou listInstances |
| Inbox agregado | **1** | F4b path |
| Attendance counts | 1 | Auxiliar |
| Messages (ao selecionar thread) | 1 + sync | Por conversa |
| **Total bootstrap** | **~3–4** | Sem thread |
| **Duplicatas inbox** | 0 | Certificado F5.9 |
| **N+1 inbox** | 0 | Com aggregated ON |

> **Nota:** Contagens runtime não foram capturadas nesta auditoria. Usar DevTools Network com filtros `chat` ou ativar `CHAT_CORE_METRICS` para medição em staging.

---

## 4. Realtime

### 4.1 Dispatcher oficial (store ON)

```
Socket.IO → ChatRealtimeBridge.subscribe → syncStoreFromSocketEvent → mapDomainEventToActions → dispatch
```

Wiring: `runtime/storeBootstrap.ts` — ingresso único via Bridge quando `CHAT_SINGLE_SOCKET=ON`; window CustomEvents só quando F1 OFF.

### 4.2 Eventos → Store

| Evento WS | Action Store |
|---|---|
| `message.created` | `messages/append` |
| `message.updated` / read / delivered / failed | `messages/update` |
| `message.deleted` | `messages/remove` |
| `conversation.updated` | `conversations/upsert` |
| `conversation.attendance_updated` | `conversations/upsert` |
| `conversation.deleted` | `conversations/remove` |

### 4.3 Listeners paralelos (anexo, não escritores quando store ON)

| Listener | Local | Comportamento store ON |
|---|---|---|
| `ChatRealtimeBridge` | `realtime/bridge.ts` | ✅ Escritor oficial |
| `Chat.tsx` socket.on handlers | ~L1579–2192 | Early-return antes de `setMessages`/`setConversations` |
| `FloatingChatProvider` window | messageCreated | UI only (pulse, nav) — sem patch/invalidate |
| `FloatingConversationWindow` | window | Early-return |
| `MobileConversationOverlay` | window | Early-return |
| `EmbeddedLeadConversationPanel` | window | ⚠️ **Ainda invalida RQ** — escopo lead |
| `useKanbanAttendanceSocketRefresh` | socket/bridge | ⚠️ `refreshCards()` HTTP — board local |
| `useKanbanBoardRealtimeCards` | window | Kanban cards |
| `ClientProfile.tsx` | socket legado | ⚠️ Fora F5.11 |
| `runtime/bootstrap.ts` window (F0) | shadow metrics | Não escreve store UI |

### 4.4 invalidateQueries por WS (store ON)

| Superfície | invalidate chat data? |
|---|---|
| Chat.tsx handlers WS | ❌ Gated |
| FloatingChatProvider | ❌ Gated (`shouldUseChatDomainStore`) |
| FloatingConversationWindow | ❌ Gated |
| MobileConversationOverlay | ❌ Gated |
| EmbeddedLeadConversationPanel | ⚠️ Sim (lead-profile, floating-chat) |
| Kanban refresh | HTTP refetch cards (não RQ chat) |

### 4.5 refreshConversation / refreshMessages

| Símbolo | Existe? | Uso store ON |
|---|---|---|
| `refreshConversation` | ❌ Não como pipeline | — |
| `refreshMessages` | Só Evolution panel legado | Fora Chat Enterprise |
| `refreshConversationIdentity` | ✅ `chatService` | CRM identity — não afeta SoT |
| `bumpConversationListRow` | ✅ Chat.tsx | No-op via `setConversations` gate |

---

## 5. React State

### 5.1 setMessages / setConversations

| Local | Ativo store ON? |
|---|---|
| `Chat.tsx` | ❌ No-op (gate) |
| `useEvolutionChat.ts` | ✅ (módulo Evolution — fora escopo) |
| `useEvolutionChatCache.ts` | ✅ (Evolution) |
| `SuperAdminPlatformSupportTicketDetail` | ✅ (Support — fora escopo) |
| Domain Store dispatch | ✅ Via commands/reducers |

### 5.2 Leitura UI Chat

```1309:1319:src/pages/Chat.tsx
  const conversationsView = chatCoreStoreReadEnabled ? chatStoreList.conversations : conversations;
  const messagesView = chatCoreStoreReadEnabled ? chatStoreMessages.messages : messages;
```

### 5.3 Exceções intencionais (store ON)

| Exceção | Motivo |
|---|---|
| `applyMessagesForQueue` | Comentários internos → `applyFloatingMessagesUpdater` (store) |
| Attendance reconcile HTTP | Contadores auxiliares UI |
| Delete conversation UI cleanup | Efeitos locais + invalidate CRM keys |
| Operations panel refresh | CRM sidebar — não SoT chat |

---

## 6. React Query

### 6.1 Chat principal (store ON)

React Query **não** é SoT de inbox/thread. Permanece para:

| Query key | Necessário? | Classificação |
|---|---|---|
| `['clients']`, `['leads']` | Sim | CRM cross-module |
| `['floating-chat']` pós-ações CRM | Sim | Invalidação CRM/float meta |
| `['chat-conversations']` | Parcial | Legado residual em delete |
| `floating-chat/*` (lista/messages) | Não (store ON) | **Legado** — gated OFF path |

### 6.2 Floating (store ON)

| Hook | store ON | store OFF |
|---|---|---|
| `useFloatingConversationListData` | Store + `loadInboxCommand` | RQ + command |
| `useFloatingConversationMessages` | Store + `loadMessagesCommand` | RQ `getConversationMessages` |

### 6.3 invalidateQueries classificação

| Padrão | Classificação |
|---|---|
| WS → invalidate floating-chat messages | **Legado** (OFF only) |
| Ações CRM (assign, link client) | **Necessário** |
| Group sync handler | **Necessário** |
| Lead embed WS | **Legado ativo** — hardening futuro |

---

## 7. Performance HTTP

| Métrica | Valor audit | Método |
|---|---|---|
| Requests ao abrir `/chat` | **~3–4** (estático) | Mapa §3.3 |
| Duplicatas inbox | **0** (certificado testes F5.9) | Unit tests |
| N+1 inbox (aggregated ON) | **0** | Code path |
| Chat vs Floating parity | **1 pipeline** | F5.9 + F5.10 |
| Medição runtime | **Pendente** | DevTools / CHAT_CORE_METRICS |

### Procedimento recomendado (staging)

1. Flags: `CHAT_CORE_STORE=ON`, `CHAT_SINGLE_SOCKET=ON`, aggregated ON.
2. Abrir `/chat` — Network: contar `conversations`, `instances`, `attendance`.
3. Selecionar thread — contar `messages` + `sync`.
4. Abrir Floating mesma conversa — **0** GET messages adicional (store hit).
5. Receber WS message — **0** GET adicional.

---

## 8. Performance React

| Métrica | Instrumentação | Valor audit |
|---|---|---|
| Renders | `recordChatRenderMs` | Requer runtime |
| Re-renders | React Profiler | Requer manual |
| Selectors | `recordSelectorExecution` | Gate `CHAT_CORE_METRICS` |
| Subscriptions | `recordStoreSubscription` | Gate `CHAT_CORE_METRICS` |
| Reducer dispatches | `auditLogDispatch` (DEV) | Requer manual |

**Hooks que disparam re-render por store update:** 5 (§1.4).

**Expectativa:** 1 dispatch WS → N subscriptions notify → M component hooks re-render (M ≤ mounts ativos). F6 virtualização reduzirá M.

---

## 9. Feature Flags

### 9.1 Matriz comportamental

| Flag | OFF | ON |
|---|---|---|
| `CHAT_CORE_STORE` | useState + RQ + WS patch | Domain Store SoT |
| `CHAT_SINGLE_SOCKET` | Socket dedicado Chat + window events | Bridge shared |
| `CHAT_WS_PATCH_*` | invalidate fallback | Bypassed quando store ON |
| `CHAT_AGGREGATED_*` | N+1 fallback | 1× HTTP agregado |
| `CHAT_INBOX_CURSOR` | — | **F6** (hardcoded false) |
| `CHAT_REDIS_WS` | — | **F7** (hardcoded false) |

### 9.2 Rollback

`CHAT_CORE_STORE=OFF` restaura:

- `setConversations` / `setMessages` ativos
- `loadInboxCommand` ainda escreve store se session existir, mas UI lê useState
- Floating RQ paths completos
- WS patch + invalidateQueries

Certificado por testes: `store.f5.9`, `store.f5.10`, `store.f5.11`, `store.f5.6.consolidation`.

### 9.3 Flags candidatas a consolidação (pós-canário)

| Grupo | Flags | Sprint alvo |
|---|---|---|
| F4b aggregated | `CHAT_AGGREGATED_FLOAT/LEAD/SIDEBAR/CHAT` | Pós-F4b canário |
| F2 ws-patch | 5 sub-flags | Obsoletas com store ON |
| F1 single socket | `CHAT_SINGLE_SOCKET` | Consolidar ON |
| F5 core store | `CHAT_CORE_STORE` | Pós-F6 canário |

---

## 10. Legacy

Ver [`LEGACY_REMOVAL_TRACKER.md`](./LEGACY_REMOVAL_TRACKER.md) — atualizado nesta auditoria.

### Resumo pós-F5

| Status | Count | Notas |
|---|---|---|
| **Migrado** | 26 | +F5.9–F5.11, L-FF-12 |
| **Ativo** | 22 | Rollback + satélites + backend |
| **Removido** | 0 | Remoção física pós-canário |

### Bloqueante vs não bloqueante F6

| Item | Bloqueante? |
|---|---|
| useState/ cache Chat (código morto gated) | ❌ |
| RQ floating-chat (OFF path) | ❌ |
| Listeners WS anexos Chat.tsx | ❌ (no-op) |
| EmbeddedLead invalidate WS | ❌ |
| Kanban HTTP refresh | ❌ |
| Dump inbox sem cursor UI | ✅ **Escopo F6** |
| `messages/prepend` / `setCursor` reducers | ✅ **Prontos para F6** |

---

## Mapa de pipelines (consolidado)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CHAT_CORE_STORE = ON                          │
├─────────────────────────────────────────────────────────────────┤
│ INBOX:  HTTP → loadInboxCommand → conversations/set → hooks     │
│ THREAD: HTTP → loadMessagesCommand → messages/set → hooks        │
│ REALTIME: WS → Bridge → syncStoreFromSocketEvent → reducers     │
│ MUTATE: chatCoreCommands → HTTP + optimistic store               │
│ READ:  selectors → useSyncExternalStore → UI                    │
├─────────────────────────────────────────────────────────────────┤
│ EXCLUÍDO (gated/no-op): setState chat, WS patch, RQ float chat  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Pendências oficiais antes / durante F6

| # | Pendência | Prioridade | Sprint |
|---|---|---|---|
| P1 | Validação manual UX checklist §12 | Alta | Pré-F6 |
| P2 | Medição runtime HTTP/React staging | Média | Pré-F6 |
| P3 | Cursor UI + load-more (`CHAT_INBOX_CURSOR`) | Alta | **F6** |
| P4 | Virtualização lista/thread | Alta | **F6** |
| P5 | Gate WS EmbeddedLead → store | Baixa | F6+ hardening |
| P6 | Kanban ler store vs HTTP refresh | Baixa | F6+ |
| P7 | Remoção física legado pós-canário | Baixa | Pós-F6 |
| P8 | Consolidar flags F4b/F2/F1 | Baixa | Pós-canário prod |

---

## 12. Checklist validação manual (operador)

Com `CHAT_CORE_STORE=ON` + `CHAT_SINGLE_SOCKET=ON`:

- [ ] `/chat` — lista carrega ≤5s
- [ ] Selecionar conversa — thread popula
- [ ] Enviar mensagem — aparece na thread + preview lista
- [ ] Receber mensagem WS — thread + lista atualizam sem F5
- [ ] Floating abre mesma conversa — dados consistentes
- [ ] Minimizar floating — pulse em mensagem incoming
- [ ] Assign/transfer/close — lista reflete estado
- [ ] Delete conversa — remove da lista
- [ ] `CHAT_CORE_STORE=OFF` — rollback funcional completo

---

## Referências

| Documento | Sprint |
|---|---|
| [SPRINT_F5.9_COMMAND_UNIFICATION_REPORT.md](./SPRINT_F5.9_COMMAND_UNIFICATION_REPORT.md) | Inbox |
| [SPRINT_F5.10_MESSAGES_COMMAND_UNIFICATION_REPORT.md](./SPRINT_F5.10_MESSAGES_COMMAND_UNIFICATION_REPORT.md) | Messages |
| [SPRINT_F5.11_REALTIME_UNIFICATION_REPORT.md](./SPRINT_F5.11_REALTIME_UNIFICATION_REPORT.md) | Realtime |
| [AUDIT_F5_MESSAGES_PIPELINE_INVESTIGATION.md](./AUDIT_F5_MESSAGES_PIPELINE_INVESTIGATION.md) | Root cause thread vazia |
| [LEGACY_REMOVAL_TRACKER.md](./LEGACY_REMOVAL_TRACKER.md) | Inventário legado |
| [SPRINT_F6.3_CONVERSATION_VIRTUALIZATION_REPORT.md](./SPRINT_F6.3_CONVERSATION_VIRTUALIZATION_REPORT.md) | F6.3 Conversation Virtualization |
| [SPRINT_F6.4_MESSAGE_VIRTUALIZATION_REPORT.md](./SPRINT_F6.4_MESSAGE_VIRTUALIZATION_REPORT.md) | F6.4 Message Virtualization |
| [SPRINT_F6.5_RENDER_OPTIMIZATION_REPORT.md](./SPRINT_F6.5_RENDER_OPTIMIZATION_REPORT.md) | F6.5 Realtime Render Optimization |
| [SPRINT_F6.6_WARM_WINDOW_REPORT.md](./SPRINT_F6.6_WARM_WINDOW_REPORT.md) | F6.6 Warm Window & Predictive Prefetch |
| [AUDIT_F6_PERFORMANCE_CERTIFICATION.md](./AUDIT_F6_PERFORMANCE_CERTIFICATION.md) | F6.7 Performance Certification |
| [PERFORMANCE_BASELINE_F6.md](./PERFORMANCE_BASELINE_F6.md) | Baseline F5.12 × F6 |
| [LEGACY_REMOVAL_READINESS.md](./LEGACY_REMOVAL_READINESS.md) | Readiness remoção legado |
| [F7_READINESS_REPORT.md](./F7_READINESS_REPORT.md) | Liberação F7 |
| [F6_ARCHITECTURE_FREEZE_REPORT.md](./F6_ARCHITECTURE_FREEZE_REPORT.md) | F6.8 Architecture Freeze |
| [ADR-010-CHAT-ARCHITECTURE-FREEZE.md](./ADR-010-CHAT-ARCHITECTURE-FREEZE.md) | ADR freeze |

---

## Assinatura de certificação

| Campo | Valor |
|---|---|
| **Fase** | F5 — Domain Store |
| **Status** | **Certificada (GO condicionado)** |
| **Data** | 2026-07-09 |
| **Testes automatizados** | 110/110 store suite |
| **Autor** | Auditoria estática Cursor Agent |
| **Próximo marco** | F7 — Redis WS (arquitetura F1–F6 congelada — ADR-010) |

---

*Auditoria read-only — nenhum código, flag ou banco foi alterado durante esta certificação.*
