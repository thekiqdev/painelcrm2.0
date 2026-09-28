# Sprint F5.7 — Stabilization & Cleanup

| Campo | Valor |
|---|---|
| **Sprint** | F5.7 |
| **Tipo** | Estabilização |
| **Data** | 2026-07-08 |
| **Objetivo** | Consolidar arquitetura F1→F5.6 antes de F6 |
| **Feature Flag** | Nenhuma nova |
| **Impacto visual** | Nenhum |

---

## Resumo executivo

Sprint de **estabilização** sem alteração funcional, de UX, de APIs ou de contratos. Revisão completa do Domain Store, métricas, feature flags, wiring, testes e documentação. Nenhum código legado foi removido fisicamente.

**Resultado:** arquitetura F1→F5.6 validada e pronta para **F6** (Cursor, Load More e Virtualização).

---

## 1. Domain Store

| Área | Status | Ações |
|---|---|---|
| Selectors | ✅ | Sem duplicações críticas; `messageSelectors.sortDomainMessages` filtra ids inválidos (F5.5) |
| Actions / reducers | ✅ | Pipeline commands intacto |
| Event bus | ✅ | `syncStoreFromSocketEvent` → `mapDomainEventToActions` |
| Hydration / persistence | ✅ | F0 placeholders mantidos (não remover) |
| Hooks | ✅ | `recordStoreSubscription` ligado em todos os `useSyncExternalStore` |
| Commands | ✅ | 12 commands via `executeChatCommand` |

### Código morto removido (sem impacto comportamental)

| Artefato | Motivo |
|---|---|
| `readStoreConversationList()` | Nunca chamado na UI ou testes |
| `bridgeMapDomainMessage()` | Export não utilizado |
| `void store` em `integration.ts` | No-op residual |
| Import `domainConversationToUi` em `useFloatingConversationListData` | Órfão |

### Mantido intencionalmente (legado / futuro)

| Artefato | Motivo |
|---|---|
| `domain/stores.ts` placeholders F0 | Contrato; remoção pós-F7 |
| `syncStoreFrom*` em `integration.ts` | Usado por commands/WS internamente |
| Validadores shadow (`shadowValidation`, `chatShadowValidation`, `commandShadowValidation`) | Testes F5.1–F5.5 |
| `recordFloatingMessageAppendLatency` | API reservada; sem call site ainda |

---

## 2. Métricas (`CHAT_CORE_METRICS`)

| Verificação | Resultado |
|---|---|
| Métricas duplicadas | Corrigido: `commandDispatcher` deixou de gravar `recordCommandLatency` + `recordCommandExecutionMs` com o mesmo valor |
| Timers sem uso | `recordFloatingMessageAppendLatency` documentado como reservado |
| `console` residual | Shadow logs centralizados em `shadowLog.ts`, gated por `CHAT_CORE_METRICS` + DEV |
| `commandShadowValidation` | Já gated por `CHAT_CORE_METRICS` |

Módulos de métricas (fragmentação aceita para F6):

- `metrics/baseline.ts` — F0–F3
- `store/metrics.ts` — hydration/sync store
- `store/consolidatedMetrics.ts` — agregado F5.6
- `store/commandMetrics.ts` — pipeline commands
- `store/chatMetrics.ts`, `floatingMetrics.ts`, `floatingMessageMetrics.ts` — superfícies

---

## 3. Feature flags

Todas validadas via `feature-flags.ts` + painel Super Admin (`chatMigrationFlags/catalog.ts`):

| Flag | Leitura | Cache | Bootstrap | Rollback |
|---|---|---|---|---|
| `CHAT_SINGLE_SOCKET` | ✅ | ✅ | `chatRealtimeBridge` | OFF → sockets legados |
| `CHAT_WS_PATCH_*` | ✅ | ✅ | `tryApplyChatWsPatch` | OFF → invalidate |
| `CHAT_INSTANCE_REGISTRY` | ✅ | ✅ | `ensureChatInstances` | OFF → fetch direto |
| `CHAT_UNREAD_ENGINE` | ✅ | ✅ | runtime F3 | OFF → contadores legados |
| `CHAT_ATTENDANCE_RECONCILE` | ✅ | ✅ | `scheduleChatAttendanceReconcile` | OFF → HTTP sempre |
| `CHAT_AGGREGATED_*` | ✅ | ✅ | repository | OFF → N+1 legado |
| `CHAT_CORE_STORE` | ✅ | ✅ | `bootstrapChatCoreFoundation` | OFF → useState + RQ |

Nenhuma flag alterada nesta sprint.

---

## 4. Wiring validado

```
Repository → Chat Core (commands + WS) → Domain Store → hooks → UI
```

### API pública UI (`store/public.ts`) — **novo F5.7**

Componentes devem importar hooks e helpers de escrita apenas de:

- `@/features/chat-core/store/public`

Migrados nesta sprint:

- `Chat.tsx`
- `FloatingConversationList.tsx`
- `FloatingConversationWindow.tsx`
- `MobileConversationOverlay.tsx`

Commands (`loadMessagesCommand`, `chatCommandBridge`) permanecem em `core/` — camada correta.

**Proibido na UI:** `syncStoreFrom*`, `getChatDomainStoreSession`, `chatDomainActionCreators` direto.

---

## 5. Performance / subscriptions

| Item | Status |
|---|---|
| `useSyncExternalStore` nos 5 hooks store | ✅ |
| Cleanup `store.subscribe` | ✅ retorna unsubscribe |
| `recordStoreSubscription` | ✅ ligado em todos os hooks |
| Memory leaks óbvios | Nenhum identificado |
| Dual-write | Removido em F5.6 |

---

## 6. Testes

```
npm test -- src/features/chat-core
```

| Arquivo | Escopo |
|---|---|
| `chat-core.f0.test.ts` | Contratos + phase F5.7 |
| `chat-core.f1.test.ts` | Single socket |
| `chat-core.f2.test.ts` | WS patch |
| `chat-core.f3.test.ts` | Registry/unread |
| `store.test.ts` | Store fundação |
| `store.f5.integration.test.ts` | Integration + shadow |
| `store.f5.2.floating.test.ts` | Floating lista |
| `store.f5.3.floating-messages.test.ts` | Floating mensagens |
| `store.f5.4.chat-readonly.test.ts` | Hooks Chat principal |
| `store.f5.5.commands.test.ts` | Commands pipeline |
| `store.f5.6.consolidation.test.ts` | SoT única |

Testes de parity (F5.2–F5.5) mantidos — validadores usados apenas em testes.

---

## 7. Auditoria de código

| Categoria | chat-core |
|---|---|
| TODO / FIXME / HACK | **0** |
| `console.log` | **0** em produção |
| `console.debug` | Apenas `shadowLog.ts` (gated) |
| `console.warn` | `commandShadowValidation` (gated `CHAT_CORE_METRICS`) |
| Imports órfãos | Removidos (ver §1) |
| Branches mortos | Nenhum crítico identificado |

---

## 8. Documentação atualizada

| Documento | Alteração |
|---|---|
| `SPRINT_F5.7_STABILIZATION_REPORT.md` | Criado |
| `LEGACY_REMOVAL_TRACKER.md` | Changelog F5.7; roadmap F6 |
| `src/features/chat-core/README.md` | Seção F5.7 + `store/public.ts` |

Nenhuma decisão arquitetural alterada.

---

## 9. Legacy Tracker

- **Nenhuma remoção física** nesta sprint
- Estatísticas inalteradas: **28 Ativo | 20 Migrado | 0 Removido**
- Próximo marco de remoção em massa: **pós-F6** (cursor UI) + **F7** (WS horizontal)

---

## 10. Critérios de aceite

| Critério | Status |
|---|---|
| Arquitetura validada | ✅ |
| Documentação consistente | ✅ |
| Feature flags revisadas | ✅ |
| Métricas revisadas | ✅ |
| Wiring validado | ✅ |
| Testes verdes | ✅ (ver saída CI local) |
| Nenhuma regressão funcional | ✅ (sem mudança de comportamento) |

---

## Próximo passo

**F6 — Cursor, Load More e Virtualização** com `CHAT_CORE_STORE` como SoT e baixo risco de dívida técnica acumulada.
