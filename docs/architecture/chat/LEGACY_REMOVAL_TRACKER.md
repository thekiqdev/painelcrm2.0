# Chat Enterprise — Legacy Removal Tracker

| Campo | Valor |
|---|---|
| **Documento** | Inventário oficial de código legado do módulo Chat |
| **Versão** | 1.0 |
| **Última atualização** | 2026-07-15 (Phase 11 / Sprint 6 — Runtime Core declaration; sem remoção física) |
| **Plano mestre** | [`CHAT_ENTERPRISE_MIGRATION_MASTER_PLAN.md`](../CHAT_ENTERPRISE_MIGRATION_MASTER_PLAN.md) |
| **Governança** | Atualizar **ao final de cada sprint** F0→F7 |

---

## Como usar este documento

1. **Não remover código legado** antes da sprint indicada e sem flag correspondente **ON em produção** por período de canário acordado.
2. Ao concluir uma sprint, atualizar a coluna **Status** e registrar entrada na **§ Changelog**.
3. Itens **Migrado** ainda **não** podem ser apagados — existem para rollback.
4. Remoção física só ocorre quando status passa para **Removido** (com PR dedicado e testes).

### Legenda de status

| Status (legado documento) | Status F6.8 freeze | Significado |
|---|---|---|
| **Ativo** | **ACTIVE** | Ainda necessário (satélite, stub, ou path primário flag OFF) |
| **Migrado** | **ROLLBACK** | Substituto atrás de flag; manter para rollback |
| **Removido** | **REMOVED** | Eliminado do repositório |
| — | **DEPRECATED** | Pode remover após canário (candidatos; ainda no código) |
| — | **REMOVE_READY** | Pronto para PR de remoção dedicada (após checklist) |

> F6.8: coluna histórica Ativo/Migrado/Removido **mantida** nas tabelas. Classificação freeze consolidada na §0 abaixo — **nenhuma remoção física**.

### Legenda — sprint de remoção

| Sprint | Condição para remoção |
|---|---|
| **Pós-Fn** | Flag da fase Fn estável em produção; canário concluído. |
| **F5+** | Depende de consolidação do Chat Core (SoT única). |
| **F6+** | Depende de paginação/cursor na UI. |
| **F7+** | Depende de escala horizontal WS. |
| **Manter** | Escopo legítimo permanente (admin, settings, rollback de longo prazo). |

---

## Resumo executivo (2026-07-13, pós F6.8)

| Métrica | Valor |
|---|---|
| Itens rastreados | 50 |
| **ACTIVE / Ativo** | 21 |
| **ROLLBACK / Migrado** | 29 |
| **REMOVED** | 0 |
| **DEPRECATED / REMOVE_READY** | ver §0 (candidatos — ainda não deletados) |
| Architecture Freeze | [`F6_ARCHITECTURE_FREEZE_REPORT.md`](./F6_ARCHITECTURE_FREEZE_REPORT.md) + [`ADR-010-CHAT-ARCHITECTURE-FREEZE.md`](./ADR-010-CHAT-ARCHITECTURE-FREEZE.md) |
| Runtime Core | [`ADR-013-DOMAIN-STORE-RUNTIME-CORE.md`](./ADR-013-DOMAIN-STORE-RUNTIME-CORE.md) — physical delete → MB-028 |
| Certificação F5 | [`AUDIT_F5_FINAL.md`](./AUDIT_F5_FINAL.md) |
| Certificação F6 | [`AUDIT_F6_PERFORMANCE_CERTIFICATION.md`](./AUDIT_F6_PERFORMANCE_CERTIFICATION.md) |
| F7 liberação | [`F7_READINESS_REPORT.md`](./F7_READINESS_REPORT.md) |
| Flags audit | [`FEATURE_FLAGS_AUDIT.md`](./FEATURE_FLAGS_AUDIT.md) |

---

## 0. Classificação F6.8 (Architecture Freeze)

### ROLLBACK (maioria dos “Migrado”)

Código dual-path mantido enquanto flags OFF existem. Exemplos:

- Chat.tsx `useState` muted + RQ Floating STORE OFF
- TanStack message virt (`mode: legacy`)
- WS patch RQ (F2)
- Sockets dedicados (F1 OFF)
- Merge N+1 HTTP (agregado OFF)
- Shadow validation / shadowLog

### DEPRECATED (candidatos pós-canário — **não remover agora**)

| ID / tema | Condição para REMOVE_READY |
|---|---|
| Shadow backend F4a (L-HTTP-B03) | Paridade staging |
| Stub `CHAT_INBOX_CURSOR` | Consolidar docs/flags |
| `ui/patch` action sem creator | Cleanup tipagem/store |
| Floating `latestPage: false` path | Dump só com `VITE_FLOAT_MESSAGES_DUMP=1` (ADR-011); default latest-page |
| commandShadowValidation morto | Confirmar 0 callers pós-canário F5 |

### REMOVE_READY

**Nenhum** item promovido a REMOVE_READY nesta sprint (política: canário produção + PR dedicado).

### ACTIVE

Satélites Kanban/Lead/Admin, Notifications socket, eventos WS legacy. Redis adapter / `CHAT_REDIS_WS` → **entregues Phase 8** (L-RT-08 / L-FF-14 Migrado).

---

---

## 1. HTTP — listas de conversas (N+1)

| ID | Artefato | Local | Status | Introduzido em | Remover em | Notas |
|---|---|---|---|---|---|---|
| L-HTTP-01 | `fetchMergedChatConversations()` | `src/lib/chatConversationsFetch.ts` | **Migrado** | pré-F0 | **Pós-F4b** | Fallback do `chatConversationsRepository`; loop N+1 + dedupe + sort |
| L-HTTP-02 | `sortConversationsByRecent()` | `src/lib/chatConversationsFetch.ts` | **Ativo** | pré-F0 | **Pós-F4b** | Merge client-side; bypass quando API agregada ON |
| L-HTTP-03 | `fetchBubbleRecentConversations()` | `src/lib/chatConversationsFetch.ts` | **Migrado** | pré-F0 | **Pós-F4b** | Wrapper de L-HTTP-01; substituído por `listBubbleChatConversations` |
| L-HTTP-04 | Loop `for (instanceId)` + `getConversations` | `src/pages/Chat.tsx` `loadConversations` | **Migrado** | pré-F0 | **Pós-F4b** | Branch legado quando `VITE_CHAT_FF_AGGREGATED_CHAT` OFF |
| L-HTTP-05 | Dedupe `Map` + `sort` pós-merge | `src/pages/Chat.tsx` | **Migrado** | pré-F0 | **Pós-F4b** | ~L1156–1167; bypass no branch agregado |
| L-HTTP-06 | Loop instância + `getConversations` (fallback) | `src/features/floating-chat/MinimizedChatDock.tsx` | **Migrado** | pré-F0 | **Pós-F4b** | Após falha ou flag float OFF |
| L-HTTP-07 | `getConversations({ inboxScope })` broad | `EmbeddedLeadConversationPanel.tsx` | **Ativo** | pré-F0 | **Pós-F4b** | Só quando `instanceIds` vazio |
| L-HTTP-08 | `getConversations` direto | `ChatKanbanAddCardDialog.tsx` | **Ativo** | pré-F4 | **F5** | 1× HTTP por instância escolhida; migrar para repository |
| L-HTTP-09 | `getConversations` direto | `InstanceDetailsDialog.tsx` | **Ativo** | pré-F4 | **Manter** | Admin por instância — escopo settings |
| L-HTTP-10 | `chatService.getConversations()` (API legada) | `src/services/chat.ts` | **Ativo** | pré-F0 | **Pós-F4b** | Manter até backend desligar path single-instance |
| L-HTTP-11 | `getConversationsAggregated()` | `src/services/chat.ts` | **Migrado** | F4b | — | Caminho novo; não remover |
| L-HTTP-12 | Branch legado `listLegacyChatConversations` | `src/repositories/chatConversationsRepository.ts` | **Migrado** | F4b | **Pós-F4b** | Fallback automático em erro |
| L-HTTP-13 | Prefetch com merge N+1 | `src/lib/chatPrefetch.ts` | **Migrado** | pré-F0 | **Pós-F4b** | Surface `sidebar` + flag `AGGREGATED_SIDEBAR` |
| L-HTTP-14 | CRM resolve loop por instância | `src/lib/resolveChatConversationForCrm.ts` | **Migrado** | pré-F0 | **Pós-F4b** | `listChatConversationsForCrmResolve` |

### Backend — listas

| ID | Artefato | Local | Status | Remover em | Notas |
|---|---|---|---|---|---|
| L-HTTP-B01 | Path legado `getConversations` (single `instanceId`) | `packages/backend/src/controllers/chatController.ts` | **Ativo** | **Pós-F4b** | Default quando `CHAT_AGGREGATED_CONVERSATIONS=0` |
| L-HTTP-B02 | Módulo agregado F4a | `packages/backend/src/services/chatAggregatedConversations/` | **Migrado** | — | SoT alvo pós-rollout |
| L-HTTP-B03 | Shadow compare | `shadowCompare.ts`, `shadowMetrics.ts` | **Migrado** | **Pós-F4b** | `CHAT_AGGREGATED_API_SHADOW=1`; remover após paridade validada |

---

## 2. Feature flags de transição

| ID | Flag (env) | Fase | Status | Remover em | Notas |
|---|---|---|---|---|---|
| L-FF-01 | `VITE_CHAT_FF_SINGLE_SOCKET` | F1 | **Migrado** | **Pós-F1** | Consolidar ON em prod antes de apagar socket legado |
| L-FF-02 | `VITE_CHAT_FF_WS_PATCH_*` (5 sub-flags) | F2 | **Migrado** | **Pós-F2** | Remover branches `invalidate` quando estáveis |
| L-FF-03 | `VITE_CHAT_FF_INSTANCE_REGISTRY` | F3 | **Migrado** | **Pós-F3** | |
| L-FF-04 | `VITE_CHAT_FF_UNREAD_ENGINE` | F3 | **Migrado** | **Pós-F3** | |
| L-FF-05 | `VITE_CHAT_FF_ATTENDANCE_RECONCILE` | F3 | **Migrado** | **Pós-F3** | |
| L-FF-06 | `VITE_CHAT_FF_AGGREGATED_FLOAT` | F4b | **Migrado** | **Pós-F4b** | Unificar em flag única após canário |
| L-FF-07 | `VITE_CHAT_FF_AGGREGATED_LEAD` | F4b | **Migrado** | **Pós-F4b** | |
| L-FF-08 | `VITE_CHAT_FF_AGGREGATED_SIDEBAR` | F4b | **Migrado** | **Pós-F4b** | |
| L-FF-09 | `VITE_CHAT_FF_AGGREGATED_CHAT` | F4b | **Migrado** | **Pós-F4b** | |
| L-FF-10 | `CHAT_AGGREGATED_CONVERSATIONS` (backend) | F4a | **Migrado** | **Pós-F4b** | |
| L-FF-11 | `CHAT_AGGREGATED_API_SHADOW` (backend) | F4a | **Migrado** | **Pós-F4b** | |
| L-FF-12 | `VITE_CHAT_FF_CORE_STORE` | F5 | **Migrado** | **Pós-F6** | F5.6–F5.11: Domain Store SoT quando ON; rollback OFF intacto |
| L-FF-13 | `VITE_CHAT_FF_INBOX_CURSOR` | F6 | **Ativo** | — | Ainda não implementado |
| L-FF-14 | `CHAT_REDIS_WS` (catalog) | F7 | **Migrado** | Pós-canário multi-réplica | Phase 8; default OFF |
| L-FF-15 | `src/lib/chatAggregatedFlags.ts` | F4b | **Migrado** | **Pós-F4b** | Pode fundir em `feature-flags.ts` após rollout |

---

## 3. Realtime — sockets

| ID | Artefato | Local | Status | Remover em | Notas |
|---|---|---|---|---|---|
| L-RT-01 | `legacySocket` + `io()` dedicado | `src/services/realtimeClient.ts` | **Migrado** | **Pós-F1** | Quando `CHAT_SINGLE_SOCKET` ON usa Bridge |
| L-RT-02 | `io({ forceNew: true })` página Chat | `src/pages/Chat.tsx` ~L1521 | **Migrado** | **Pós-F1** | Segundo socket em `/chat` |
| L-RT-03 | `io()` dedicado | `src/pages/ClientProfile.tsx` | **Migrado** | **Pós-F1** | |
| L-RT-04 | Socket kanban attendance | `src/hooks/useKanbanAttendanceSocketRefresh.ts` | **Migrado** | **Pós-F1** | |
| L-RT-05 | `ChatRealtimeBridge` | `src/features/chat-core/realtime/bridge.ts` | **Migrado** | — | Substituto F1; não remover |
| L-RT-06 | Handlers eventos **legado** WS | `CHAT_WS_EVENTS_LEGACY` em `contracts.ts` | **Ativo** | **F7+** | Remover quando backend emitir só v2 |
| L-RT-07 | `useNotifications` socket próprio | `src/hooks/useNotifications.ts` | **Ativo** | **Fora F0–F7** | Módulo Notifications — ADR separada |
| L-RT-08 | Redis WS adapter | `realtime/redisSocketAdapter.ts` | **Migrado** | Pós-canário | Phase 8; fallback memory |

---

## 4. Realtime — invalidate / refetch (anti-patch)

| ID | Artefato | Local | Status | Remover em | Notas |
|---|---|---|---|---|---|
| L-INV-01 | `invalidateQueries(['floating-chat', …])` pós-WS | `FloatingChatProvider.tsx` | **Migrado** | **Pós-F5.11** | Gated quando `CHAT_CORE_STORE` ON (F5.11); fallback OFF |
| L-INV-02 | Idem | `FloatingConversationWindow.tsx` | **Migrado** | **Pós-F5.11** | Gated store ON |
| L-INV-03 | Idem | `MobileConversationOverlay.tsx` | **Migrado** | **Pós-F5.11** | Gated store ON |
| L-INV-04 | `invalidateFloatingChatLists()` | `floatingChatQueries.ts` | **Migrado** | **Pós-F5.11** | Só invocado em path OFF / CRM |
| L-INV-05 | `invalidateQueries(['floating-chat'])` CRM | `ClientProfile.tsx`, `Leads.tsx`, `EmbeddedLeadConversationPanel.tsx` | **Ativo** | **F5** | Após SoT única |
| L-INV-06 | Lista/mensagens `useState` + refetch WS | `src/pages/Chat.tsx` | **Migrado** | **Pós-F5.6** | Guardado quando `CHAT_CORE_STORE` ON; legado só com flag OFF |
| L-INV-07 | `refreshCards()` kanban pós-WS | Kanban attendance hook | **Ativo** | **F5** | Board estado local |
| L-INV-08 | HTTP `attendance-counts` pós-evento | `Chat.tsx`, `useChatNavUnreadCount.ts` | **Migrado** | **Pós-F3** | Unread Engine reduz; não elimina reconcile |

### Substituto F2 (manter)

| Artefato | Local | Status |
|---|---|---|
| `tryApplyChatWsPatch()` | `src/features/chat-core/ws-patch/` | **Migrado** |

---

## 5. Instâncias — registry e HTTP redundante

| ID | Artefato | Local | Status | Remover em | Notas |
|---|---|---|---|---|---|
| L-INST-01 | `chatService.listInstances()` direto nos consumidores | vários (flag OFF) | **Migrado** | **Pós-F3** | `ensureChatInstances` com registry ON |
| L-INST-02 | Branch legado registry | `instance-registry/registry.ts` | **Migrado** | **Pós-F3** | Fallback `listInstances()` |
| L-INST-03 | `listInstances` em Settings | `InstancesList.tsx` | **Ativo** | **Manter** | Bootstrap conexão WhatsApp (escopo settings) |
| L-INST-04 | Superadmin instances | `SuperAdminPlatformWhatsAppPanel.tsx` | **Ativo** | **Manter** | Escopo platform admin |

---

## 6. Unread / contadores

| ID | Artefato | Local | Status | Remover em | Notas |
|---|---|---|---|---|---|
| L-UNR-01 | Poll 120s nav badge | `useChatNavUnreadCount.ts` | **Migrado** | **Pós-F3** | Mantido quando `CHAT_UNREAD_ENGINE` OFF |
| L-UNR-02 | HTTP direto `attendance-counts` | `useChatNavUnreadCount.ts`, prefetch | **Migrado** | **Pós-F3** | Unread Engine + reconcile |
| L-UNR-03 | Branch legado unread | `unread-engine/engine.ts` | **Migrado** | **Pós-F3** | |
| L-UNR-04 | `fetchChatAttendanceCounts` no prefetch | `chatPrefetch.ts` | **Migrado** | **Pós-F3** | |

---

## 7. Estado e cache paralelos (SoT)

| ID | Artefato | Local | Status | Remover em | Notas |
|---|---|---|---|---|---|
| L-CACHE-01 | `chatPageCache` (localStorage) | `src/lib/chatPageCache.ts` + `Chat.tsx` | **Migrado** | **Pós-F5.6** | Bypass quando `CHAT_CORE_STORE` ON |
| L-CACHE-02 | `useState` conversas/mensagens Chat | `src/pages/Chat.tsx` | **Migrado** | **Pós-F5.6** | SoT = Domain Store quando flag ON |
| L-CACHE-03 | React Query `floating-chat/*` | vários float | **Migrado** | **Pós-F5.6** | RQ só com `CHAT_CORE_STORE` OFF |
| L-CACHE-04 | React Query `lead-profile/*` | lead embed | **Ativo** | **F5** | |
| L-CACHE-05 | `chatRepository` interface F0 | `chat-core/repository/chatRepository.ts` | **Migrado** | **Pós-F6** | Runtime usa `delegatingChatRepository`; interface permanece |
| L-CACHE-06 | Dump completo inbox (sem cursor UI) | `Chat.tsx` load | **Migrado** | **F6** | API retorna cursor; UI load-more pendente |
| L-CACHE-08 | Dump integral de mensagens (sem Load More UI) | `loadMessagesCommand` | **Migrado** | **F6.3+** | F6.1: Chat última página + Load More; F6.2: Window Cache; Floating ainda dump (`latestPage: false`) |
| L-CACHE-07 | `clearChatPageCacheForSession` | `queryClient.ts` | **Ativo** | **F5** | Ligado ao cache v1/v2 |

---

## 8. Métricas e instrumentação transitória

| ID | Artefato | Local | Status | Remover em | Notas |
|---|---|---|---|---|---|
| L-MET-01 | `chatConversationsMetrics.ts` | `src/lib/` | **Migrado** | **F5** | Simplificar após legado HTTP removido |
| L-MET-02 | Shadow metrics F4a | `shadowMetrics.ts` | **Migrado** | **Pós-F4b** | |
| L-MET-03 | `chat-core/metrics/baseline.ts` | F0–F3 | **Migrado** | **F5** | Manter observabilidade core |
| L-MET-04 | `chat-core/metrics/*` F5.12 performance layer | F5.12 | **Migrado** | **Pós-F6** | Telemetria DEV + `CHAT_CORE_METRICS`; baseline pré-F6 |

---

## 9. Mapa sprint → remoções previstas

```
F0  ✓ contrato/baseline        → nada a remover
F1  ✓ single socket           → L-RT-01..04 (Pós-F1)
F2  ✓ ws-patch                 → L-INV-01..04 (Pós-F2)
F3  ✓ registry + unread        → L-INST-01..02, L-UNR-* (Pós-F3)
F4a ✓ API agregada backend      → L-HTTP-B03 shadow (Pós-F4b)
F4b ✓ repository frontend      → L-HTTP-01..14, L-FF-06..11 (Pós-F4b)
─────────────────────────────────────────────────────────
F5  ✓ Chat Core store           → L-CACHE-*, L-INV-01..07, L-FF-12; certificado AUDIT_F5_FINAL
F6  ✓ cursor / virt / freeze     → F6.0–F6.8 ✓ Architecture Freeze (ADR-010); Floating dump residual
F7  ✓ Redis WS adapter           → L-RT-08 / L-FF-14 Migrado (PHASE8_CLOSEOUT)
```

---

## 10. Ordem recomendada de remoção (pós-canário)

| Ordem | Bloco | Pré-requisito |
|---|---|---|
| 1 | Shadow backend F4a (L-HTTP-B03, L-FF-11) | Paridade agregado ≈ legado em staging |
| 2 | HTTP N+1 frontend (L-HTTP-01..14) | Todas flags F4b ON + backend ON |
| 3 | Flags F4b por superfície (L-FF-06..09) | Unificar em flag única |
| 4 | Sockets duplicados (L-RT-01..04) | F1 ON em produção |
| 5 | Invalidate float (L-INV-01..04) | F2 sub-flags ON |
| 6 | Registry/unread legado (L-INST-01..02, L-UNR-*) | F3 ON em produção |
| 7 | chatPageCache + useState Chat (L-CACHE-01..02) | **F5.6** completo — remoção física pós-canário F6 |
| 8 | Keys RQ fragmentadas (L-CACHE-03..04) | **F5.6** + **F6** cursor |
| 9 | Cursor UI + janela quente | **F6** |
| 10 | WS horizontal + eventos legacy | **F7** |

---

## 11. Itens explicitamente fora do escopo de remoção

| Item | Motivo |
|---|---|
| `chatService` como cliente HTTP genérico | Permanece; só muda quem chama |
| `FloatingChatProvider` (UI state) | Painéis/minimize — não é SoT de domínio |
| `InstancesList` / QR polling | Settings — não é inbox |
| `useNotifications` socket | Módulo Notifications |
| Fluxo legado CRM (notas, faturas) | Domínio CRM, não Chat |

---

## 12. Changelog

| Data | Sprint | Alteração |
|---|---|---|
| 2026-07-15 | **Phase 11 / Sprint 6** | ADR-013 Domain Store = Runtime Core. Dual-path Store OFF permanece **ROLLBACK**. Checklist MB-028 em `PHASE11_LEGACY_RETIREMENT.md`. **Sem remoção física.** |
| 2026-07-14 | **Phase 5** | Store/Legacy coexistence: ADR-011 Float latest-page; invalidate coalesce; cache precedence; socket telemetry; `check:chat-sot-guards`. **Sem remoção física.** |
| 2026-07-13 | **F6.8** | Architecture Freeze: ADR-010 + contratos/API/store/flags/deps docs. Classificação ACTIVE/ROLLBACK/DEPRECATED/REMOVE_READY. Sem remoção de código. 202 testes store. |
| 2026-07-13 | **F6.7** | Performance Certification: AUDIT_F6 + baseline F6 + legacy readiness + F7 liberada. Sem alteração de código. 202 testes store. |
| 2026-07-13 | **F6.5** | Realtime Render Optimization: `useStableSelector`, `dispatchBatch`, Bridge coalesce, memo rows. 190 testes store. |
| 2026-07-13 | **F6.6** | Warm Window + Predictive Prefetch idle; heat score; `useConversationWarmup`. 202 testes store. |
| 2026-07-13 | **F6.4** | Message Virtualization: engine/height/overscan + hooks; Chat thread `mode:core` (store ON); TanStack legado no Floating/OFF. 178 testes store. |
| 2026-07-13 | **F6.3** | Conversation Virtualization: engine/overscan/height cache + hooks; Chat sidebar virtualizada (store ON). Floating intacto. 166 testes store. |
| 2026-07-13 | **F6.2** | Sliding Window Cache: registry/eviction/pin/memory (~5 páginas); actions/selectors/hooks + `windowMetrics`. UX inalterada. 154 testes store. |
| 2026-07-13 | **F6.1** | Incremental Load More no Chat: última página na abertura, botão + scroll preserve + guards + `loadMoreMetrics`. Floating permanece dump integral. 143 testes store. |
| 2026-07-13 | **F6.0** | Cursor Engine: estado/actions/selectors/hooks + `loadMessagesCursorCommand` + merge + scroll foundation + `cursorMetrics`. UX inalterada. L-CACHE-08 **Migrado**. 132 testes store. |
| 2026-07-13 | **F5.12** | Performance Baseline & Telemetry: camada `metrics/*` (render/reducer/selector/http/socket/memory/report); gate DEV + `CHAT_CORE_METRICS`; L-MET-04 **Migrado**. Sem mudança funcional. 118 testes store. |
| 2026-07-09 | **AUDIT F5 FINAL** | Certificação arquitetura F5: **GO condicionado** para F6. 110 testes store. L-FF-12, L-INV-01..04, L-CACHE-05 → **Migrado**. Resumo: 22 Ativo \| 26 Migrado \| 0 Removido. |
| 2026-07-09 | **F5.11** | Realtime Unification: Bridge → Store como único writer realtime (store ON); gates em Chat/Floating; `realtime/policy.ts`; remove double window sync quando F1 ON. |
| 2026-07-09 | **F5.10** | Messages Command Unification: `loadMessagesCommand` único (Chat + Floating); `repositorySync.listMessages` usa `toDomainMessage()`; `applyStoreMessagesInternal`; removidos pipelines `surface: 'core'|'float'`. Corrige thread vazia `/chat`. |
| 2026-07-09 | **F5.9** | Inbox Command Unification: `loadInboxCommand` único; `applyStoreConversationList` removido da UI; bootstrap/refresh unificados. |
| 2026-07-08 | **F5.7** | Estabilização: `store/public.ts` (API UI); shadow logs gated `CHAT_CORE_METRICS`; cleanup código morto; wiring validado. **0** mudanças de status no inventário. |
| 2026-07-08 | **F5.6** | Consolidação Domain Store: `CHAT_CORE_STORE` ON = SoT única; removido shadow parity/dual-write na UI; `consolidation.ts`; L-CACHE-01..03 e L-INV-06 → **Migrado**. |
| 2026-07-08 | **F4b** | Documento criado. 20 itens **Migrado** (F1–F4b). 28 **Ativo**. 0 **Removido**. |

---

## 13. Template de atualização (copiar ao fechar sprint)

```markdown
### YYYY-MM-DD — Sprint FX

**Itens migrados nesta sprint:**
- L-XXX-NN: descrição → status **Migrado**

**Itens removidos nesta sprint:**
- L-XXX-NN: descrição → status **Removido** (PR #____)

**Ainda ativos (bloqueados):**
- L-XXX-NN: motivo / sprint alvo

**Resumo:** X Ativo | Y Migrado | Z Removido
```

---

*Este tracker é a fonte oficial para PRs de remoção de legado. Qualquer remoção antecipada exige ADR e atualização deste documento.*
