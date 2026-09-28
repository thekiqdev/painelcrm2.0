# AUDIT F1–F4.1 — Validação Final Pré-F5

**Audit:** `AUDIT_F1_F4_FINAL_VALIDATION` v1.0  
**Data:** 2026-07-08  
**Tipo:** Validação (read-only — nenhum código, banco ou flag alterado)  
**Objetivo:** Confirmar estabilidade da arquitetura F1–F4.1 antes de iniciar **F5 (Chat Domain Store)**

---

## Resumo executivo

| Fase | Veredito | Confiança |
|------|----------|-----------|
| **F1** Single Socket | **Aprovado** | Alta (código + testes) |
| **F2** WS Patch | **Aprovado com ressalvas** | Alta (escopo parcial documentado) |
| **F3** Instance Registry | **Aprovado** | Alta (código + testes) |
| **F4 / F4.1** Aggregated API | **Aprovado** | Alta (hotfix UazAPI + testes) |

### Recomendação GO/NO-GO para F5

**GO condicionado** — iniciar implementação da F5 (Domain Store) com **todas as flags OFF** em produção.

| Critério | Status |
|----------|--------|
| Nenhuma regressão funcional com flags OFF | Validado (rollback path intacto) |
| Nenhum bug crítico conhecido em código | Validado (F4.1 corrige lista vazia UazAPI) |
| Testes automatizados F0–F4.1 | **46/46 passando** |
| Realtime / API agregada / Feature Flags | Implementados; canário manual staging **pendente** |
| Perda de mensagens/conversas / socket duplicado | **Não detectado** em análise estática |

**Condições antes de ligar flags em produção:** executar checklist manual §8 (mínimo: F4.1 inbox UazAPI + F1 socket count + fallback F4 OFF).

---

## Metodologia

1. **Análise estática** do código F1–F4.1 (bridge, ws-patch, registry, aggregated API, repository, flags panel).
2. **Testes automatizados** executados em 2026-07-08 (sem alterações no repositório).
3. **Revisão** dos relatórios de sprint e `LEGACY_REMOVAL_TRACKER.md`.
4. **Sem teste E2E manual** nesta auditoria (browser, duas abas, F5 refresh) — checklist documentado para QA.

Backend local: `/health` respondendo (ambiente `start.bat` ativo).

---

## Testes automatizados

### Frontend (vitest root)

| Suite | Testes | Resultado |
|-------|--------|-----------|
| `chat-core.f0.test.ts` | 6 | Pass |
| `chat-core.f1.test.ts` | 3 | Pass |
| `chat-core.f2.test.ts` | 9 | Pass |
| `chat-core.f3.test.ts` | 6 | Pass |
| `chatConversationsRepository.test.ts` | 4 | Pass |
| **Subtotal** | **28** | **Pass** |

### Backend (`packages/backend`)

| Suite | Testes | Resultado |
|-------|--------|-----------|
| `chatAggregatedConversations.test.ts` (F4a + F4.1) | 15 | Pass |
| `chatMigrationFlags/service.test.ts` | 3 | Pass |
| **Subtotal** | **18** | **Pass** |

**Total: 46 testes — 100% passando.**

---

## Validação por grupo

Legenda: **Auto** = evidência automatizada/código | **Manual** = requer QA em browser | **Doc** = documentado como pendência conhecida

### Conectividade

| Check | Resultado | Evidência |
|-------|-----------|-----------|
| Apenas um Socket.IO por sessão (chat) | **Auto: OK com F1 ON** | `ChatRealtimeBridge` singleton (`bridge.ts`); `realtimeClient.ts` desliga legacy ao ligar F1 |
| Reconnect funciona | **Manual pendente** | Bridge reconecta em troca de token (`bridge.ts`); não testado E2E nesta auditoria |
| Logout/Login funciona | **Manual pendente** | `AuthContext` carrega flags no login; bridge teardown no logout — padrão correto no código |
| Refresh (F5) mantém funcionamento | **Manual pendente** | Bridge remonta via AppShell; sem teste E2E |
| Duas abas sincronizadas | **Manual pendente** | CustomEvents + RQ cache compartilham estado; validação multi-tab não executada |
| Socket de notificações separado | **Doc: fora F1** | `useNotifications.ts` — 2º socket app-wide; não é regressão F1, item L-RT-07 no tracker |

**F1 veredito:** Aprovado. Risco residual: canário manual + socket notificações (não bloqueia F5).

---

### Conversas

| Check | Resultado | Evidência |
|-------|-----------|-----------|
| Todas as conversas aparecem (F4 ON, UazAPI) | **Auto: OK pós-F4.1** | `channelPredicate.ts` — `instanceIds` + `whatsapp_official_account_id IS NULL` |
| Quantidade igual ao legado | **Auto: parcial** | Testes SQL F4.1; paridade shadow **Doc: canário 7d pendente** |
| Ordenação correta | **Auto: OK** | Keyset cursor sem OFFSET; testes cursor codec |
| Pesquisa / filtros | **Auto: OK** | Query builder mantém filtros attendance, tags, unread, groups |
| Troca de instância | **Manual pendente** | Repository passa `instanceIds`; UX inalterada por design F4b |
| Nenhuma conversa desaparece | **Auto: OK pós-F4.1** | Bug `includeWhatsAppOfficial=1` → official-only **corrigido** |
| Fallback F4 → legado | **Auto: OK** | `fetchAggregatedList` catch → `fetchLegacyList`; teste dedicado |

**F4 veredito:** Aprovado. WhatsApp Oficial em chamada agregada única: **fora de escopo F4.1** (sprint futura).

---

### Mensagens

| Check | Resultado | Evidência |
|-------|-----------|-----------|
| Enviar / receber / editar / excluir / marcar lida | **Manual pendente** | Fluxos não alterados por F1–F4.1 (sem mudança de UX) |
| Realtime permanece funcionando | **Auto: OK** | F1 bridge repassa eventos; F2 patch opcional com fallback invalidate |

**Nota F2:** Patch ativo em Floating Chat / overlay mobile; **Chat.tsx inbox principal** ainda usa `useState` (escopo F2 report §4) — não é regressão, é deuda planejada para F5.

---

### Floating Chat

| Check | Resultado | Evidência |
|-------|-----------|-----------|
| Lista / mensagens / dock / overlay | **Manual pendente** | Consumidores migrados via `listChatConversations` + flag `CHAT_AGGREGATED_FLOAT` |
| F2 patch + F4 aggregated | **Auto: OK** | `FloatingChatProvider` usa patch + repository |

---

### CRM

| Check | Resultado | Evidência |
|-------|-----------|-----------|
| Lead / Cliente / Quick View → conversa | **Auto: OK (código)** | `findChatConversationById`, `listChatConversationsForCrmResolve`; flag `CHAT_AGGREGATED_LEAD` |
| ResolveConversation | **Auto: OK** | Aggregated path evita loop N+1 quando flag ON |

**Ressalva:** `EmbeddedLeadConversationPanel` fallback direto `getConversations` quando sem `instanceIds` — legado intencional (tracker).

---

### Sidebar

| Check | Resultado | Evidência |
|-------|-----------|-----------|
| Badge unread | **Auto: OK (F3)** | `CHAT_UNREAD_ENGINE` + reconcile opcional |
| Prefetch | **Auto: OK** | `chatPrefetch.ts` → repository; flag `CHAT_AGGREGATED_SIDEBAR` |
| Sem múltiplas `listInstances` | **Auto: OK com F3 ON** | Teste dedupe `chat-core.f3.test.ts`; OFF = N chamadas (legado) |

---

### Performance

| Check | Resultado | Evidência |
|-------|-----------|-----------|
| Sem loops N+1 (F4 ON) | **Auto: OK** | 1 GET agregado vs N× legado |
| Sem rajadas HTTP (F3 ON) | **Auto: OK** | Registry TTL 2min + in-flight dedupe |
| API agregada utilizada | **Auto: OK** | `isChatAggregatedSurfaceEnabled(surface)` por superfície |
| Erros 500 / SQL / React | **Não observados** | Testes passando; sem execução E2E nesta auditoria |
| Shadow p95 ≤ legado | **Doc: pendente** | `CHAT_AGGREGATED_API_SHADOW` — canário staging |

---

### Feature Flags

| Check | Resultado | Evidência |
|-------|-----------|-----------|
| F1–F4.1 ligáveis pelo painel | **Auto: OK** | `SuperAdminChatMigrationFlagsPage`; 16 keys em `catalog.ts` |
| Rollback individual | **Auto: OK** | Cada flag default `false`; superfícies F4 independentes |
| Sem dependência de `.env` | **Auto: OK** | `chatMigrationFlagManager` → `GET /api/chat/migration-flags`; backend `chatMigrationFlags/service.ts` |
| Docs ainda citam `.env` | **Doc: inconsistência** | Master Plan / F4b report — **código usa painel** como source of truth |

---

## Aprovação por fase

### F1 — Single Socket ✅ Aprovado

- Implementação: `ChatRealtimeBridge`, `realtimeClient.ts`, consumidores Chat / ClientProfile / Kanban.
- Rollback: flag OFF → sockets dedicados legados.
- Testes: 3 (f1) + cobertura f0.
- Pendências: canário staging manual; unificação socket notificações (F8+).

### F2 — WS Patch ✅ Aprovado com ressalvas

- Implementação: 5 sub-flags, `tryApplyChatWsPatch`, fallback invalidate obrigatório.
- Escopo atual: Floating Chat, overlay mobile, parcial Chat.tsx.
- **Ressalva:** inbox `/chat` principal não usa RQ patch — alvo F5.
- Testes: 9 (f2).

### F3 — Instance Registry ✅ Aprovado

- Implementação: registry + unread engine + reconcile coordinator.
- Dedupe `listInstances`: testado.
- Pendências: `InstancesList.tsx` admin bypass; buckets queue/mine/team reconcile parcial.

### F4 / F4.1 — Aggregated API ✅ Aprovado

- F4a backend + shadow; F4b repository + superfícies; **F4.1 hotfix UazAPI**.
- Fallback automático para legado em erro HTTP.
- Testes: 15 backend + 4 repository.
- Pendências: shadow canary 7d; merge UazAPI+Oficial; cursor UI load-more (F6).

---

## Lista de pendências (não bloqueantes F5)

| ID | Item | Fase | Bloqueia F5? |
|----|------|------|--------------|
| P-01 | Canário manual staging (F1 socket count, F2 invalidates, F3 HTTP, F4 paridade) | Todas | Não (dev F5 com flags OFF) |
| P-02 | Shadow metrics 7 dias (`CHAT_AGGREGATED_API_SHADOW`) | F4a | Não |
| P-03 | p95 agregado ≤ legado em staging | F4a | Não |
| P-04 | WhatsApp Oficial em API agregada única | Pós-F4.1 | Não |
| P-05 | Socket notificações unificado com chat | F1+ | Não |
| P-06 | Chat.tsx inbox → Domain Store (useState → store) | **F5** | Escopo F5 |
| P-07 | Cursor / load-more na UI | F6 | Não |
| P-08 | Atualizar docs que citam `VITE_CHAT_FF_*` / `.env` | Docs | Não |
| P-09 | `EmbeddedLeadConversationPanel` fallback sem instanceIds | F4b | Não |
| P-10 | `InstancesList.tsx` não usa registry F3 | F3 | Não |

---

## Checklist manual recomendado (pré-produção flags ON)

Executar em staging ou local com painel Super Admin → **Otimização do Chat**:

1. **Baseline flags OFF** — inbox, float, CRM, sidebar idênticos ao comportamento histórico.
2. **F1** — `CHAT_SINGLE_SOCKET=1` → DevTools Network/WS: **1** conexão Socket.IO de chat em `/chat` ( +1 notificações se sino ativo).
3. **F3** — trio registry/unread/reconcile → uma chamada `/api/chat/instances` por janela TTL ao navegar float + chat + nav.
4. **F2** — sub-flags uma a uma → floating chat recebe mensagem sem refetch HTTP visível (métricas `[chat-core-metrics]` se `CHAT_CORE_METRICS=1`).
5. **F4.1** — `CHAT_AGGREGATED_CHAT=1` em tenant **100% UazAPI** → mesma quantidade de conversas que flags OFF; ordenação e filtros OK.
6. **Rollback** — desligar flag F4 → legado imediato; desligar F1 → sockets dedicados voltam.
7. **Duas abas** — enviar mensagem em aba A → aparece em aba B (float ou `/chat`).
8. **F5 refresh** — recarregar página com flags ON → reconexão WS e lista intacta.

---

## Critérios NO-GO (nenhum acionado)

| Critério NO-GO | Detectado? |
|----------------|------------|
| Perda de mensagens | Não |
| Perda de conversas (pós-F4.1) | Não (corrigido em código) |
| Duplicação de Socket (F1 ON) | Não em análise estática |
| Fallback quebrado | Não (teste repository) |
| Problemas de sincronização | Não verificado E2E |

---

## Conclusão

A arquitetura **F1–F4.1 está estável para iniciar a F5** do ponto de vista de:

- Implementação completa e flag-gated com rollback.
- **46 testes automatizados passando.**
- Hotfix F4.1 elimina bug crítico (inbox vazia UazAPI).
- Nenhum critério NO-GO acionado na análise disponível.

**Recomendação final: GO condicionado** — prosseguir com F5 (Chat Domain Store) mantendo flags desligadas em produção até conclusão do checklist manual §8 e, idealmente, canário shadow F4 em staging.

---

*Auditoria read-only — nenhum código, banco de dados ou feature flag foi modificado durante esta validação.*
