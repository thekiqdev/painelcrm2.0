# Sprint F0 — Foundation — Relatório Técnico

| Campo | Valor |
|---|---|
| **Fase** | F0 — Foundation |
| **Data** | 2026-07-08 |
| **Master Plan** | [`CHAT_ENTERPRISE_MIGRATION_MASTER_PLAN.md`](../CHAT_ENTERPRISE_MIGRATION_MASTER_PLAN.md) |
| **Alteração funcional** | **Nenhuma** |
| **Alteração de UX / visuals** | **Nenhuma** |
| **Wiring na UI legada** | **Nenhum** (`Chat.tsx`, Floating, Lead, RQ, sockets intactos) |

---

## 1. Objetivo cumprido

Preparar a infraestrutura arquitetural do **Chat Core** sem otimizar requisições, sem alterar fluxos e sem modificar comportamento da interface.

O sistema continua operando exatamente como antes. A base está pronta para **F1** (socket único).

---

## 2. Arquivos criados

```
src/features/chat-core/
  README.md
  index.ts
  feature-flags.ts
  chat-core.f0.test.ts
  core/
    chatCore.ts
  domain/
    types.ts
    public-api.ts
    stores.ts
    adapters.ts
  repository/
    chatRepository.ts
  realtime/
    bridge.ts
    contracts.ts
    normalize.ts
  metrics/
    baseline.ts
```

Relatório:

```
docs/architecture/chat/SPRINT_F0_FOUNDATION_REPORT.md
```

---

## 3. Estrutura criada

Conforme Master Plan (§5 Chat Core):

| Pasta | Papel F0 |
|---|---|
| `core/` | Orquestração stub (`chatCore`, `isWired === false`) |
| `domain/` | Tipos, API pública, placeholders de stores, adapters legado |
| `repository/` | Stub HTTP tipado (não chama API com sucesso; lança `ChatCoreNotWiredError`) |
| `realtime/` | Bridge não conectado + contratos WS + normalizers puros |
| `metrics/` | Coletores de baseline / observabilidade |

---

## 4. Interfaces criadas

| Interface / tipo | Arquivo | Status |
|---|---|---|
| `ChatCorePublicApi` | `domain/public-api.ts` | Contrato + stub |
| `ChatCoreCommands` | idem | Commands tipados (não wired) |
| `ChatCoreSelectors` | idem | Selectors vazios |
| `ChatCoreEventApplier` | idem | `applyEvent` no-op |
| `ChatRepository` | `repository/chatRepository.ts` | Stub |
| `ChatRealtimeBridge` | `realtime/bridge.ts` | `status: not_wired` |
| Domain models | `domain/types.ts` | Contratos-alvo |
| Store placeholders | `domain/stores.ts` | Conversation / Message / Instance / Unread |

---

## 5. Contratos definidos

### 5.1 WebSocket

- `CHAT_WS_EVENTS_V2` — nomes v2 (`message.created`, `conversation.updated`, …)
- `CHAT_WS_EVENTS_LEGACY` — fallback (`new_message`, `conversation_updated`, …)
- Payloads documentais mínimos (`ChatWsMessageCreatedPayload`, etc.)

### 5.2 Normalizadores (puros, sem consumo na UI)

- `normalizeMessageCreatedEvent`
- `normalizeConversationUpdatedEvent`
- `normalizeConversationDeletedEvent`
- `normalizeMessageUpdatedEvent`
- `normalizeAttendanceUpdatedEvent`
- `normalizeChannelStatusChangedEvent`
- `normalizeWhatsappInstanceRemovedEvent`
- `normalizeSocketEventByName` (router)

Listeners atuais (`realtimeClient`, `Chat.tsx`) **não** foram alterados.

### 5.3 Adapters legado (opcionais F5)

- `adaptLegacyChatMessage` / `adaptLegacyConversation` reexportam normalizers de `@/services/chat` sem substituí-los.

---

## 6. Feature Flags criadas

Todas **off** por padrão (`VITE_CHAT_FF_*=1` para ativar no futuro):

| Fase | Flag | Env |
|---|---|---|
| F1 | `CHAT_SINGLE_SOCKET` | `VITE_CHAT_FF_SINGLE_SOCKET` |
| F2 | `CHAT_WS_PATCH` | `VITE_CHAT_FF_WS_PATCH` |
| F3 | `CHAT_INSTANCE_REGISTRY` | `VITE_CHAT_FF_INSTANCE_REGISTRY` |
| F4 | `CHAT_AGGREGATED_CONVERSATIONS` | `VITE_CHAT_FF_AGGREGATED_CONVERSATIONS` |
| F5 | `CHAT_CORE_STORE` | `VITE_CHAT_FF_CORE_STORE` |
| F6 | `CHAT_INBOX_CURSOR` | `VITE_CHAT_FF_INBOX_CURSOR` |
| F7 | `CHAT_REDIS_WS` | `VITE_CHAT_FF_REDIS_WS` |

API: `isChatPhaseFlagEnabled`, `getChatPhaseFlagsSnapshot`, `CHAT_PHASE_TO_FLAG`.

---

## 7. Métricas / observabilidade

Módulo: `metrics/baseline.ts`

| Métrica | API |
|---|---|
| Quantidade / amostras de requests | `recordChatHttpRequest` → `getChatBaselineSnapshot().httpRequestCount` |
| Sockets | `recordChatSocket` + `openSocketsEstimate` |
| Tempo abertura chat / marks | `markChatCoreTiming` / `measureChatCoreTiming` (`chat_open`) |
| Tempo load mensagens | `measureChatCoreTiming(..., 'messages_load')` |
| Tempo atualização realtime | `recordChatRealtimeUpdate` (`applyMs`) |

Logs ativos em DEV ou `VITE_CHAT_CORE_METRICS=1`.

**Nota F0:** a UI legada **ainda não** instrumenta esses coletores (para não alterar comportamento). A infraestrutura está pronta; F1+ pode plugar de forma opt-in.

---

## 8. Testes

`src/features/chat-core/chat-core.f0.test.ts` — **6 testes passando** (normalizers, flags off, core unwired, baseline).

---

## 9. Itens preparados para a F1

1. `ChatRealtimeBridge` com API `connect` / `disconnect` / `subscribe`.
2. Contratos e normalizers de eventos prontos para o Bridge único.
3. Flag `CHAT_SINGLE_SOCKET` pronta para gate.
4. Métricas de socket (`recordChatSocket`) prontas para baseline pré/pós F1.
5. Sem dependência circular: UI legada não importa o Core ainda.

**F1 sugerida:** `Chat.tsx` deixa de criar `io({ forceNew })` quando `CHAT_SINGLE_SOCKET` estiver on, consumindo eventos via Bridge; flag off = caminho atual.

---

## 10. Riscos encontrados

| Risco | Mitigação F0 |
|---|---|
| Import acidatal do `chatRepository` em UI → throw | Documentado; stub lança `ChatCoreNotWiredError`; não exportado em rotas |
| Side-effect no import do módulo | `bootstrapChatCoreFoundation` é **explícito** (não auto-executa) |
| Confusão Domain types vs `ChatConversation` atual | Types domain são alvo; adapters legado existem; UI continua em `@/services/chat` |
| Normalizers divergirem do comportamento real de `Chat.tsx` | F0 não substitui consumidores; F1 compara em canário |

---

## 11. Confirmação de não alteração funcional

| Verificação | Resultado |
|---|---|
| `Chat.tsx` modificado? | **Não** |
| Floating Chat modificado? | **Não** |
| `realtimeClient` / `useRealtimeEvents`? | **Não** |
| React Query keys / invalidate? | **Não** |
| Polling / endpoints? | **Não** |
| Novo Socket aberto pelo Core? | **Não** (`not_wired`) |
| Feature flags on? | **Não** (todas false) |
| UX / visual? | **Inalterados** |

---

## 12. Critérios de aceite — checklist

- [x] Chat continua funcionando exatamente igual (sem wiring)
- [x] Nenhuma regressão funcional introduzida no hot path
- [x] Nenhuma mudança visual
- [x] Nenhuma mudança de comportamento
- [x] Infraestrutura da nova arquitetura preparada
- [x] Projeto pronto para iniciar F1

---

## 13. Critérios de Encerramento da F0

A Sprint F0 só pode ser considerada **encerrada** quando todos os critérios abaixo forem verdadeiros:

| # | Critério | Status |
|---|---|---|
| 1 | **Nenhum componente da UI depende do Chat Core.** | Cumprido — sem imports em `Chat.tsx`, Floating, Lead, Sidebar ou demais superfícies |
| 2 | **Nenhum comportamento funcional foi alterado.** | Cumprido — hot path, RQ, sockets, polling e UX intactos |
| 3 | **Nenhum código legado foi removido.** | Cumprido — apenas arquivos novos sob `src/features/chat-core/` |
| 4 | **Todas as Feature Flags permanecem OFF.** | Cumprido — snapshot padrão com todas as flags `false` |
| 5 | **O Chat Core pode ser completamente removido sem impactar o sistema.** | Cumprido — módulo isolado, bootstrap não auto-executa, UI não referencia o Core |
| 6 | **A arquitetura está preparada para iniciar a F1 sem novas mudanças estruturais.** | Cumprido — Bridge, contratos WS, normalizers e flag `CHAT_SINGLE_SOCKET` prontos |

**Encerramento formal:** F0 **aprovada para fechamento**. Próxima fase autorizada: **F1 — Socket único** (atrás de `CHAT_SINGLE_SOCKET`).

---

## 14. Critérios para Início da F1

A Sprint **F1 somente poderá iniciar após a aprovação formal da F0** (critérios de encerramento da §13 cumpridos e aceite explícito do time).

### 14.1 Pré-condições obrigatórias

| # | Critério | Status / evidência |
|---|---|---|
| 1 | **Todos os itens da F0 aprovados.** | §12 + §13 deste relatório |
| 2 | **Feature Flag `CHAT_SINGLE_SOCKET` disponível.** | `feature-flags.ts` → env `VITE_CHAT_FF_SINGLE_SOCKET` (off por padrão) |
| 3 | **Chat Core permanece isolado da UI.** | Sem imports de UI no Core; removível sem impacto |
| 4 | **Baseline de métricas registrada.** | Infra em `metrics/baseline.ts`; snapshot via `getChatBaselineSnapshot` (registrar baseline operacional no kickoff F1) |
| 5 | **Plano de rollback definido.** | Flag off restaura socket dedicado em `Chat.tsx` / caminho legado; sem deploy irreversível |
| 6 | **Nenhuma regressão conhecida pendente.** | Sem bugs abertos atribuídos à F0 no hot path do Chat |

### 14.2 Escopo único da F1

A F1 terá como **único objetivo** unificar a conexão Socket.IO (um socket por sessão autenticada, via Chat Realtime Bridge), **sem alterar o comportamento funcional** do Chat.

### 14.3 Fora do escopo da F1

- Qualquer **otimização de requisições HTTP** continua **fora do escopo** da F1.
- Sem mudanças de React Query / `invalidateQueries` / polling de domínio.
- Sem consolidação do Domain Store (F5).
- Sem endpoint agregado de conversas (F4).

**Gate:** iniciar F1 apenas com checklist §14.1 verde e aprovação formal da F0.

---

*SPRINT F0 FOUNDATION — somente infraestrutura. Sem otimização de requests e sem mudança de produto.*
