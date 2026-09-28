# MASTER IMPLEMENTATION PLAN — Engineering Consolidation

| Campo | Valor |
|---|---|
| **Documento** | MASTER_IMPLEMENTATION_PLAN |
| **Tipo** | master_engineering_plan |
| **Prioridade** | Critical |
| **Data** | 2026-07-14 |
| **Revisão** | Phases 0–8 CLOSED — ver `MASTER_IMPLEMENTATION_FINAL_REPORT.md` |
| **Status de execução** | **CONCLUÍDO** (gates Phase 0→8 CLOSED; backlog Future permanece listado) |
| **Objetivo** | Consolidar auditorias técnicas num plano único de engenharia priorizado **e** referência máxima de governança técnica |
| **Closeout oficial** | `docs/architecture/MASTER_IMPLEMENTATION_FINAL_REPORT.md` + `ARCHITECTURE_STATUS_2026.md` |

---

## Precedência documental

Este documento é a **referência oficial** para implementação futura **e** a **referência máxima de governança técnica** do projeto. Audits e planos anteriores permanecem como **evidência** e **anexos**; em conflito, aplica-se a **GOVERNANCE HIERARCHY** (MASTER no topo). Detalhes adicionais em Document Conflicts abaixo.

### Fontes principais consolidado

| Família | Documentos-chave |
|---|---|
| Runtime app-wide | `AUDIT_APP_BOOTSTRAP_HYDRATION_PERFORMANCE.md`, `AUDIT_RUNTIME_EXECUTION_MASTER.md`, `AUDIT_RUNTIME_COST_MODEL.md`, `AUDIT_END_TO_END_RUNTIME_FLOW.md` |
| Performance legado | `docs/performance/AUDIT_PERFORMANCE_MASTER_PLAN.md`, `AUDIT_REACT_QUERY_RUNTIME.md`, `AUDIT_S0_4_RUNTIME_PERFORMANCE.md` |
| Chat Enterprise F0–F6 | `CHAT_ENTERPRISE_MIGRATION_MASTER_PLAN.md`, sprints F0–F6.*, `AUDIT_F5_*`, `AUDIT_F6_*`, `LEGACY_REMOVAL_*` |
| Freeze Chat | `ADR-010-CHAT-ARCHITECTURE-FREEZE.md`, `F6_ARCHITECTURE_FREEZE_REPORT.md`, `PUBLIC_API_FREEZE.md`, `DOMAIN_STORE_FREEZE.md`, `FEATURE_FLAGS_AUDIT.md` |
| Escala / WS | `AUDIT_CHAT_SCALE_READINESS.md`, `AUDIT_CHAT_REALTIME_ARCHITECTURE.md`, `F7_READINESS_REPORT.md` |
| Plataforma SaaS | `IMPLEMENTATION_ROADMAP_AND_ROLLOUT_STRATEGY.md`, `MASTER_PLAN_SIGNUP_TRIAL_ONBOARDING_CONVERSION.md`, acquisition/*, automation/*, communication/* |
| Billing | `docs/billing/*` (ADR-001/002, runtime/causality/database audits), `architecture/billing/*` |
| Observability / AI | `observability/` (previsto), `AI_INTEGRATION_ARCHITECTURE_AUDIT.md` |

### Document Conflicts (explícitos)

| Conflito | Documentos | Resolução MASTER |
|---|---|---|
| “Congelar features até recuperação de perf” vs Chat F1–F6 entregue | `AUDIT_PERFORMANCE_MASTER_PLAN` (2026-06-22) vs Freeze F6.8 | **Freeze Chat F1–F6 prevalece**; Performance Master passa a backlog **app-wide / shell / CRM**, não reabre Core Chat sem ADR |
| Roadmap SaaS P0 (outbox/workers) vs Runtime “isolar workers do HTTP” | `IMPLEMENTATION_P0_*` vs `AUDIT_RUNTIME_*` | Complementares: P0 = domain events; Runtime Phase = isolamento processo + densidade |
| Defaults flags OFF vs “caminho certificado STORE ON” | `FEATURE_FLAGS_AUDIT` vs Cost Model | **Ops P0**: canário flags certificadas; engenharia não assume ON em produção |
| Remoção física de legado vs `Removido=0` | Tracker vs audits antigos “remover já” | **Sem remoção física** até canário estável (ADR-010) |
| F7 “liberada” vs Redis/runbooks ausentes | `F7_READINESS` vs Scale audit | Liberada para **desenho**; implementação exige Redis HA + runbooks (Phase 8) |
| Archive `wa_archived` inbox vs sync UazAPI | Incidente operacional Jul/2026 + E2E flow | Isolamento inbox permanece; sync não deve poluir `wa_archived` (produto CRM-owned) |

---

# 1 — Executive Summary

PainelCRM é um **SaaS multi-tenant** (React + Node/Express + PostgreSQL + Socket.IO) com domínio principal **Chat/WhatsApp Enterprise**, CRM, Financeiro, Agenda, Billing, Aquisição/Onboarding e camada Super Admin / Ops Kanban.

**Estado arquitetural (2026-07-14):**

| Domínio | Maturidade | Nota |
|---|---|---|
| Chat Core F1–F6 (Bridge, Store, Commands, Cursor, Virt, Warm) | **Alta** (freeze ADR-010) | Caminho caro se flags OFF |
| Shell / Bootstrap / Auth TTI | **Média–baixa** | Waterfall auth 3 HTTP |
| Backend Chat SQL (legado list/messages) | **Média–baixa** | Correlated / `json_agg` |
| Workers + processo HTTP único | **Baixa para escala** | ~19 timers no mesmo Node |
| WebSocket multi-réplica | **Não pronto** | Sem Redis adapter |
| Billing / Acquisition / Ops | **Alta em docs + parcial em código** | Planos próprios; não misturar no Core Chat |
| Observability produção | **Baixa** | `console.*` denso; métricas Chat DEV-gated |

**Veredito executivo:** a plataforma está **pronta para evoluções controladas** — Chat Core **congelado**; prioridade imediata é **estabilização operacional (flags + incidentes de produto)** e **runtime app-wide** (HTTP/SQL/workers), não reescrita do Domain Store.

---

# 2 — Current Architecture

## 2.1 Frontend

```text
main.tsx → App.tsx
  QueryClientProvider → Theme → AuthProvider
    → ChatQueryPersistBridge (IndexedDB idle)
    → ModulePermissionsProvider
      → Routes / AuthGuard
        → AppShell
             FloatingChatDeferred, TenantBrand, ChatNavUnread,
             HeaderRealtimeBridge, Sidebar prefetch
             → Pages (Dashboard, Chat, CRM, Finance, Agenda, Settings)
```

- **SoT Chat (flags ON):** Domain Store (`chat-core`) + Commands (`loadInbox` / `loadMessages`) + Repository.
- **SoT legado (flags OFF):** React Query + estado local (`Chat.tsx` monólito ~7k LOC) + invalidates.
- **UI shells:** AppShell, SettingsLayout, SuperAdminLayout, Floating Chat.

## 2.2 Backend

- Express em `packages/backend` — controllers (chat monolítico grande), middlewares `auth` / `tenantAuthCrm`, services, SQL direto via `pg` pool.
- Chat: list legacy + aggregated (`chatAggregatedConversations`), attendance, wa-archive, UazAPI webhooks, official WhatsApp paths.

## 2.3 Workers

- ~19 workers/timers no **mesmo processo** HTTP (`index.ts` ~559–720): flags, kanban moves, proposals, notificações, billing overdue, announcements (~4s), agenda, chat SLA, scheduled messages, avatar cache, trials, etc.
- Scripts separados: billing scheduler/worker (janelas dedicadas no `start.bat`).

## 2.4 Banco

- PostgreSQL multi-tenant por `tenant_id` / ownership em chat.
- Hotspots: conversations list (legacy `MAX(messages)`), messages comments `json_agg`, SLA N+1; attendance-counts eficiente.
- Migrations: `database/init` + `migrationOrder.ts` (descoberta **não** automática).

## 2.5 WebSocket

- Socket.IO no servidor HTTP; rooms `user:` / `tenant:`.
- FE: F1 ON → `ChatRealtimeBridge` shared; F1 OFF → multi-`io()` (Chat + Profile + Kanban risk).
- STORE ON → Bridge → store sync; OFF → invalidate / window events.
- **Sem** Redis adapter → single-node sticky obrigatório para HA.

## 2.6 Cache

| Camada | Papel |
|---|---|
| React Query | Shell, Float, páginas não-Store |
| Domain Store | SoT chat domínio |
| Window / Warm | Paginação / prefetch msgs |
| IndexedDB | Persist RQ subset (idle) |
| chatPageCache / local-session | Legado / auth |
| Redis | Ausente (apps) |

## 2.7 Store / React / Runtime / Bootstrap

- Store: 12 slices, commands F5.x, virt F6.x, freeze ADR-010.
- Bootstrap: auth serial `me → features → migration-flags` → permissions → shell fan-out.
- Feature flags Chat: catalog Super Admin, **default OFF**.
- Multi-tenant: tenant no user + RLS/predicates + plan features.
- Integrações: UazAPI, WhatsApp Official, gateways pagamento, Google Calendar/Drive, Meta (growth).

---

# 3 — Inventory (síntese operacional)

> Inventário **estratégico** (não é file dump completo). Detalhe fino: audits de referência.

| Categoria | Itens representativos |
|---|---|
| **FE modules** | `src/features/chat-core`, `floating-chat`, pages Chat/Dashboard/Clients/Leads/Finance/Agenda/Settings, contexts Auth/Permissions/Brand |
| **Providers** | QueryClient, Auth, Permissions, Theme, FloatingChat, TenantBrand, ChatNavUnread |
| **Hooks** | `useChat*`, virt/warmup/cursor, RQ hooks por módulo |
| **Store** | Domain store session, commands, selectors, ws-patch, metrics |
| **Repositories** | `chatConversationsRepository`, chat-core repository layer |
| **BE controllers** | `chatController` (mega), attendance, wa-archive, kanban, billing, acquisition, appointments |
| **Middlewares** | auth JWT, tenant CRM gates, feature checks |
| **Workers** | ~19 in-process + billing out-of-process |
| **Flags Chat** | F1 socket, F2 WS-patch×5, F3 registry/unread/reconcile, F4 aggregated×4+shadow, F5 store, metrics/stubs F6/F7 |
| **Pipelines** | Auth bootstrap, inbox load, messages load, realtime sync, upsert webhook, billing renew, outbox publish |
| **Docs families** | architecture/*, performance/*, billing/*, chat F*, acquisition, automation, commercial, lifecycle |

---

# 4 — Runtime Flow

```text
Login / token restore
  → GET /api/auth/me → features → chat/migration-flags
  → GET my-permissions
  → AuthGuard → AppShell
       ‖ company | instances+attendance-counts | socket | page data
  → Dashboard overview | Chat inbox | CRM lists | Finance | Agenda
  → Realtime → Store ou invalidate
  → Background workers (server)
Logout
  → POST /api/auth/logout (best-effort)
  → clear RQ + page cache + IDB + flags defaults + token
  → disconnectRealtime /navigate login
```

Timeline detalhada: `AUDIT_END_TO_END_RUNTIME_FLOW` §§2–3, 11.

### Nota produto (inbox archive)

- Inbox padrão **exclui** `wa_archived=true` (BE+FE).
- Visível só com filtro/tag **Arquivadas** (inclui grupos via mesmo predicado + `conversationFilter=groups`).
- `wa_archived` é **CRM-owned** (PATCH wa-archive); sync UazAPI não deve mass-marcar.

---

# 5 — Technical Debt

| Categoria | Dívida |
|---|---|
| **Frontend** | `Chat.tsx` monólito; dual SoT; mount CRM (clients/leads); invalidate storms; ClientProfile socket risk |
| **Backend** | `chatController` monolítico; logs `console` densos; middlewares SQL por request |
| **Banco** | List/messages correlacionados; índices/EXPLAIN não calibrados live; migration order easy miss |
| **React** | Re-renders shell; Float dump; providers sempre ativos |
| **Workers** | Co-located HTTP; announcement 4s; SLA N+1 |
| **WebSocket** | Multi-io se F1 OFF; sem Redis; emits always-log |
| **Runtime / Cache** | RQ∥Store∥IDB overlap; page cache legado |
| **Store** | Float ainda dump-path; legado REMOVE_READY sem remoção |
| **Feature Flags** | Defaults OFF = dual forever; stubs always-false |
| **Infra** | Single-node WS; falta budgets APM |

---

# 6 — Duplicate Matrix

| Recurso | Duplicação | Onde |
|---|---|---|
| `/api/chat/instances` | 2–3 callers | Unread, Floating, Chat |
| Company | 2 | Brand + Settings |
| Conversations/messages SoT | RQ + Store + IDB | dual flags |
| Socket | 1 vs 2–4 | F1 ON/OFF |
| Attendance counts | shell + chat | Unread / Chat |
| Clients/Leads | CRM pages + Chat mount | Chat.tsx |
| List SQL | legacy vs aggregated | flag F4 |
| Docs planos | Performance Master vs Runtime Master vs Chat Master vs SaaS Roadmap | resolver via este MASTER |
| Billing audits | múltiplos causality/runtime | consolidar em billing ADR + este roadmap Phase billing |

---

# 7 — Bottleneck Matrix (por impacto)

| Rank | Gargalo | Impacto | Evidência |
|---|---|---|---|
| 1 | Flags OFF → caminho legado | Prod global | FEATURE_FLAGS_AUDIT + Cost Model |
| 2 | Auth waterfall 3 HTTP | TTI | AuthContext |
| 3 | SQL list/messages legado | p95 Chat | chatController |
| 4 | Multi-socket F1 OFF | CCU/mem | Chat.tsx / realtime audits |
| 5 | Instances multi-fetch | HTTP shell | Unread+Float+Chat |
| 6 | Invalidate storms | HTTP pós-WS | Chat/Float counts |
| 7 | Workers no event loop HTTP | Latência API | index.ts |
| 8 | Chat.tsx monólito | Manutenção/render | LOC |
| 9 | Sem Redis WS | Escala horizontal | Scale/F7 |
| 10 | Logs BE verbosos | I/O | console counts |

---

# 8 — Risk Matrix

### P0
- Produção com flags Chat OFF (custo/regressão disfarçada)
- Multi-socket / multi-réplica sem Redis
- Migration não registrada em `migrationOrder` (coluna ausente → inbox vazia)
- Poluição `wa_archived` via sync (inbox some / lista “errada”)

### P1
- Auth TTI waterfall
- Instances duplicate + Chat CRM mount
- SQL correlacionado list/messages
- Invalidate storms STORE OFF
- Canário incompleto F1+F4+F5

### P2
- Workers densos + logs
- Cache overlap memória
- Float dump
- Billing/notification edge cases (audits billing)

### P3
- Remoção física legado Chat
- Dead code notifications sockets
- AI integration (pré-requisito AS-IS ok; não urgente runtime)

---

# 9 — Dependency Graph

```text
Auth (/me → features → flags)
  → Permissions → AppShell
       → Brand / Unread(instances→counts) / Socket / Idle Float+IDB
            → Page modules
Chat page
  → instances → loadInbox → Repository → API → SQL
  → loadMessages → Store/RQ → Virt → Warm
  → Bridge subscribe → syncStore (STORE ON) | invalidate (OFF)
Workers ← process boot (paralelo ao HTTP)
Billing scripts ← processos separados
F7 Redis ← Bridge estável (F1) + Store (F5) + flags
Legacy removal ← canário flags + ADR
```

- **Bloqueia:** Auth bloqueia shell; instances bloqueiam inbox; Redis HA bloqueia F7 code complete.
- **Acorda:** WS acordam Store/RQ; workers acordam SQL/HTTP egress; invalidate acorda refetch.
- **Invalida:** logout limpa RQ/IDB; archive isola inbox; flag toggle troca SoT.

---

# 10 — Optimization Opportunities (NÃO IMPLEMENTAR)

| ID | Oportunidade | Impacto | Benefício | Esforço | Dependências | Risco | Rollback | ROI |
|---|---|---|---|---|---|---|---|---|
| O1 | Canário F1+F4+F5(+F2) | P0 | Corta dual-path | Ops Baixo | Staging QA Chat | Médio | Flag OFF | **Muito Alto** |
| O2 | Baselines live (Network/Profiler/EXPLAIN) | P1 | Mede ganho | Baixo | Staging | Nenhum | N/A | Alto |
| O3 | Single-flight instances | P1 | −HTTP shell | Baixo | Registry F3 | Baixo | PR revert | Alto |
| O4 | Lazy clients/leads no Chat | P1 | −payload mount | Baixo | UX Chat | Baixo | PR revert | Alto |
| O5 | Auth parallel/bundle | P1 | TTI↓ | Médio | Auth API | Médio | Gate | Alto |
| O6 | Throttle/struct logs BE | P2 | I/O↓ | Baixo | Observability | Baixo | Revert | Médio |
| O7 | Float latest-page (fim dump) | P2 | Mem/HTTP↓ | Médio | Store freeze ADR | Médio | Flag | Médio |
| O8 | SQL reshape list/messages | P1 | p95↓ | Alto | API compat | Médio | Dual path | Alto |
| O9 | Isolar workers processo | P2 | CPU API↑ | Alto | Deploy | Médio | Dual | Médio |
| O10 | F7 Redis adapter | Escala | Multi-node WS | Alto | Redis HA | Alto | Sticky 1-node | Escala |
| O11 | Extrair Chat.tsx / decompor controller | P3 | Manutenibilidade | Alto | Freeze + sprints | Médio | Branch | Longo |
| O12 | Política `wa_archived` CRM-only + filtro UI/Store | P0 produto | Inbox correta | Baixo–Médio | Archive feature | Baixo | Flag/PR | Alto |
| O13 | Registrar migrations no order | P0 | Evita lista quebrada | Baixo | migrate | Baixo | — | Alto |

---

# MASTER BACKLOG

Inventário único de melhorias/dívidas com rastreabilidade. **Status atual = planejamento; nenhuma linha autoriza implementação implícita.**

**Legenda de domínio:** FE · BE · DB · WK · INF · RT · FF  
**Tipo:** Bug · Perf · Refactor · Arch · Scale · UX · Obs  
**Status:** Not Started · Blocked · Ready · Future

| ID | Título | Descrição | Domínio | Tipo | Prioridade | Impacto | Esforço | Dependências | Sprint sugerida | Status | ADR? | Documentos relacionados | Observações |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MB-001 | Canário flags Chat certificados | Ligar F1+F4+F5(+F2) em staging/prod canário | FF · RT | Arch | P0 | Muito Alto | Baixo | QA Chat | Phase 0 | Completed | Não | FEATURE_FLAGS_AUDIT, `CHAT_CANARY_COMPOSITION_MB001.md` | Catalog defaults OFF; ops canário |
| MB-002 | Baselines live Network/Profiler/EXPLAIN | Preencher células `?` dos audits | RT · Obs | Obs | P1 | Alto | Baixo | Staging | Phase 0 | Completed | Não | `PHASE0_BASELINES_MB002.md` | Live gaps ⚠ documentados |
| MB-003 | Política wa_archived CRM-only | Sync não mass-marca; inbox isola arquivadas; grupos inclusos | FE · BE · DB | Bug · UX | P0 | Alto | Médio | Archive feature | Phase 0 | Completed | Não | E2E FLOW, PHASE0_CLOSEOUT | |
| MB-004 | Migrations no migrationOrder | Garantir 291+ futuros no order + CI | DB · INF | Bug | P0 | Alto | Baixo | migrate.ts | Phase 0 | Completed | Não | RUNTIME audits | |
| MB-005 | Runbook canário Chat | Checklist ON/OFF + smoke send/receive | RT · FF | Obs | P0 | Alto | Baixo | MB-001 | Phase 0 | Completed | Não | `CHAT_CANARY_RUNBOOK_MB005.md` | Ops |
| MB-006 | Auth waterfall TTI | Parallel/bundle me+features+flags | FE · BE | Perf | P1 | Alto | Médio | Phase 0 baselines | Phase 1 | Completed | Não | BOOTSTRAP, `authBootstrap.ts`, PHASE1_CLOSEOUT | hops 3→2 |
| MB-007 | Soft-lazy Brand/Unread | Adiar fan-out não crítico do shell | FE | Perf | P2 | Médio | Médio | Auth estável | Phase 1 | Completed | Não | BOOTSTRAP, PHASE1_CLOSEOUT | idle brand+unread |
| MB-008 | Single-flight instances | Dedup Unread+Float+Chat | FE | Perf | P1 | Alto | Baixo | F3 registry | Phase 2 | Completed | Não | `chatInstancesHttpCache`, PHASE2_CLOSEOUT | HTTP layer (não chat-core) |
| MB-009 | Lazy clients/leads no Chat mount | Não carregar CRM no mount Chat | FE | Perf · UX | P1 | Alto | Baixo | UX aceite | Phase 2 | Completed | Não | Chat.tsx, PHASE2_CLOSEOUT | Vincular on-demand |
| MB-010 | Dedup company Brand∥Settings | Uma fonte HTTP company | FE | Perf | P2 | Médio | Baixo | Phase 2 | Phase 2 | Completed | Não | `tenantCompanyHttpCache`, PHASE2_CLOSEOUT | |
| MB-011 | SQL conversations legacy reshape | Remover/otimizar MAX correlacionado | BE · DB | Perf | P1 | Muito Alto | Alto | F4 canário, EXPLAIN | Phase 3 | Completed | Não | `effectiveLastMessage.ts`, PHASE3_CLOSEOUT | env rollback MAX |
| MB-012 | SQL messages comments reshape | Evitar COUNT/json_agg por msg | BE · DB | Perf | P1 | Muito Alto | Alto | MB-011 baselines | Phase 3 | Completed | Não | `messageCommentsSql.ts`, PHASE3_CLOSEOUT | |
| MB-013 | Aggregated default pós-canário | Superfícies F4 ON estável | FF · BE | Arch | P1 | Alto | Médio | MB-001 | Phase 3 | Completed | Não | PHASE3_CLOSEOUT | Dual-path; catalog flags intactas |
| MB-014 | Throttle/structured logs BE | Cortar console always-on | BE · Obs | Obs · Perf | P2 | Médio | Baixo | Policy log | Phase 4 / 7 | Completed | Não | `appLogger`, PHASE4_CLOSEOUT | LOG_HTTP opt-in |
| MB-015 | Isolar workers densos | Processo aparte do HTTP | WK · INF | Scale · Arch | P2 | Alto | Alto | Deploy topology | Phase 4 | Completed | Não | `denseWorkerBootstrap`, `workers:dense` | skip env |
| MB-016 | Chat SLA N+1 redesign | Worker SLA sem refresh por-row | WK · DB | Perf | P2 | Alto | Alto | MB-015 opcional | Phase 4 | Completed | Não | `chatSlaWorkerService`, PHASE4_CLOSEOUT | |
| MB-017 | Announcement worker frequency | Revisar intervalo ~4s | WK | Perf | P2 | Médio | Médio | Prod metrics | Phase 4 | Completed | Não | default 15s, PHASE4_CLOSEOUT | |
| MB-018 | Expandir canário Store + tracker | Reduzir dual-path; statuses LEGACY | FF · FE | Arch | P1 | Médio | Médio | Phase 0–2 | Phase 5 | Completed | Não | PHASE5_STORE_INVENTORY | Sem remoção física |
| MB-019 | Float latest-page | Fim dump completo mensagens | FE · Store | Perf | P2 | Médio | Médio | ADR se Core | Phase 5 | Completed | **Sim** | ADR-011, PHASE5_CLOSEOUT | dump via VITE env |
| MB-020 | Invalidate storms STORE OFF | Reduzir invalidate Chat/Float | FE | Perf | P1 | Alto | Médio | Canário Store | Phase 5 | Completed | Não | floatingChatQueries coalesce | |
| MB-021 | Decompor Chat.tsx | Extrair containers sem mudar contratos | FE | Refactor | P3 | Médio | Alto | STORE estável | Phase 6 | Done | Não** | ADR-010 | **ADR se mudar public API |
| MB-022 | Memo/shell Performance Master | Header/Nav rerenders | FE | Perf | P2 | Médio | Médio | Phase 1 | Phase 6 | Done | Não | AUDIT_PERFORMANCE_MASTER | |
| MB-023 | Bundle AppLayout | Split route / chunk budget | FE | Perf | P2 | Médio | Alto | Phase 6 | Phase 6 | Done | Não | performance/* | |
| MB-024 | APM + error budgets | Visibilidade produção | INF · Obs | Obs | P2 | Alto | Médio | MB-014 | Phase 7 | Done | Não | OBS roadmap | |
| MB-025 | Chat metrics prod policy | Além de DEV-gated | FF · Obs | Obs | P3 | Médio | Médio | MB-024 | Phase 7 | Done | Sim | FEATURE_FLAGS_AUDIT | |
| MB-026 | Redis Socket.IO adapter F7 | Multi-réplica WS | INF · RT | Scale | P0 escala | Escala | Alto | F1 ON, Redis HA | Phase 8 | Done | **Sim** | F7_READINESS | |
| MB-027 | CHAT_REDIS_WS wiring | Flag stub → real | FF · INF | Scale | P0 escala | Escala | Médio | MB-026 | Phase 8 | Done | Sim | FEATURE_FLAGS_AUDIT | |
| MB-028 | Remoção física legado Chat | Após coexistência mínima | FE · BE | Arch | P3 | Médio | Alto | Canário longo | Future | Future | **Sim** | LEGACY_REMOVAL_READINESS | Proibido antes do prazo |
| MB-029 | Decompor chatController | Fatiar monólito BE | BE | Refactor | P3 | Médio | Alto | Freeze + testes | Future | Future | Sim | STATIC_DEPENDENCY | |
| MB-030 | Multi-socket residual OFF path | Eliminar io() dedicados | FE | Perf · Bug | P1 | Alto | Médio | MB-001 F1 ON | Phase 0/5 | Completed | Não | dedicatedSocketTelemetry + CI | legado OFF telemetrado |
| MB-031 | Cache overlap RQ∥Store∥IDB | Política de precedência | FE · RT | Arch · Perf | P2 | Médio | Médio | Phase 5 | Phase 5 | Completed | Não | cachePrecedence.ts | |
| MB-032 | Soft-delete page cache legado | Limpeza chatPageCache | FE | Refactor | P3 | Baixo | Baixo | — | Future | Future | Não | queryClient logout | |
| MB-033 | CI verifica migrationOrder | Fail se SQL init fora do order | INF | Bug | P1 | Alto | Baixo | MB-004 | Phase 0 | **Completed** | Não | `npm run check:migration-order` | enforce≥291 |
| MB-034 | Phase B Billing continuity | Seguir ADRs billing sem Chat | BE · DB | Arch | P1 domínio | Alto | Contínuo | Bounded context | Phase B | Ready | Conforme ADR billing | billing/ADR-* | Paralelo permitido |
| MB-035 | Phase B Acquisition/Onboarding | Planos acquisition sem Core Chat | FE · BE | Arch | P1 domínio | Alto | Contínuo | Master SaaS | Phase B | Ready | Conforme | MASTER_PLAN_SIGNUP_* | Paralelo |
| MB-036 | AI Platform prep | Extensões pós AS-IS | Arch | Future | P3 | Baixo agora | Alto | AI audit | Future | Future | Sim | AI_INTEGRATION_ARCHITECTURE_AUDIT | Não misturar runtime |
| MB-037 | Outbox/workers P0 SaaS | Domain events plataforma | WK · BE | Arch | P1 SaaS | Alto | Alto | IMPLEMENTATION_P0 | Phase B | Ready | Conforme | DOMAIN_EVENT_AND_OUTBOX | Não = MB-015 |
| MB-038 | ClientProfile socket isolation | Evitar io() extra | FE | Perf | P2 | Médio | Médio | F1 ON | Phase 5 | Completed | Não | ClientProfile bridge + telemetry | |
| MB-039 | Groups + wa_archived parity | Grupos respeitam Arquivadas | FE · BE | Bug · UX | P0 | Alto | Baixo | MB-003 | Phase 0 | **Completed** | Não | queryBuilder groups | Parte de MB-003 |
| MB-040 | Dual-path SoT prohibition enforcement | Lint/CI bloqueia sync legado | FE · Arch | Arch | P2 | Médio | Médio | Phase 5 | Phase 5 | Completed | Sim | `check:chat-sot-guards` | |

**Resumo de status:** Phase 0 MBs **Completed** · Ready (Phase B / itens liberados) · Blocked (aguardam gate) · Future (fases tardias).

---

# IMPLEMENTATION GATES

Nenhuma fase poderá iniciar sem que a fase anterior esteja **oficialmente encerrada**.

Cada fase deverá possuir obrigatoriamente:

- Objetivo  
- Escopo  
- Pré-requisitos  
- Dependências  
- Critérios de entrada  
- Critérios de saída  
- Critérios de rollback  
- Critérios de aceite  
- Métricas esperadas  
- Evidências obrigatórias  

Somente após **todos** os critérios de saída estarem concluídos a próxima fase poderá iniciar.

É **proibido** executar fases em paralelo quando existir **dependência arquitetural** (Phases 0→8 sequenciais).  
**Exceção controlada:** Phase B (Billing/Acquisition/Ops) pode correr em paralelo **somente** se **não** tocar Chat Core congelado, migrations Chat críticas, nem o mesmo domínio da sprint runtime ativa.

Isso impede misturar tarefas de fases diferentes na mesma execução.

---

## Gate — Phase 0 Critical Stabilization

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Estabilizar operação: flags, baselines, archive/inbox, migrations |
| **Escopo** | MB-001…MB-005, MB-033, MB-039; runbooks; **sem** refactors Store/SQL grandes |
| **Pré-requisitos** | MASTER PLAN aprovado; staging disponível |
| **Dependências** | Nenhuma fase runtime anterior |
| **Critérios de entrada** | Doc sprint Phase 0 publicado; escopo congelado; ADR-010 reconhecido |
| **Critérios de saída** | Canário documentado; baselines células críticas preenchidas; wa_archived isolado verificado; migrationOrder+CI; smoke Chat OK |
| **Critérios de rollback** | Flags OFF; revert PRs Phase 0; repair SQL documentado se aplicado |
| **Critérios de aceite** | Sign-off QA Chat + Ops; checklist Network cold start anexado |
| **Métricas esperadas** | Dual-path canário medido; instances≈1 no canário F3; inbox não vazia por coluna ausente |
| **Evidências** | Relatório Phase 0 close-out; screenshots Network; SQL counts wa_archived; diff migrationOrder |
| **Status oficial** | **CLOSED** (`docs/architecture/sprints/PHASE0_CLOSEOUT.md`, 2026-07-14) |

## Gate — Phase 1 Runtime Shell & Bootstrap

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Reduzir TTI bootstrap auth/shell |
| **Escopo** | MB-006, opcional MB-007 |
| **Pré-requisitos** | **Phase 0 oficialmente closed** |
| **Dependências** | Baselines Phase 0 |
| **Critérios de entrada** | Close-out Phase 0 aprovado; plano sprint Auth |
| **Critérios de saída** | Waterfall auth reduzido ou justificado; sem regressão login |
| **Critérios de rollback** | Feature gate / revert auth fetch |
| **Critérios de aceite** | QA login+permissions+flags; TTI staging vs baseline |
| **Métricas esperadas** | Hops auth ≤2 **ou** bundle único documentado; TTI↓ vs Phase 0 |
| **Evidências** | Trace Network before/after; relatório Auth; `PHASE1_METRICS_MB006_MB007.md` |
| **Status oficial** | **CLOSED** (`docs/architecture/sprints/PHASE1_CLOSEOUT.md`, 2026-07-14) |

## Gate — Phase 2 HTTP Dedup

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Eliminar fetches HTTP duplicados no shell/Chat |
| **Escopo** | MB-008, MB-009, opcional MB-010 |
| **Pré-requisitos** | **Phase 1 closed** |
| **Dependências** | Canário Store ajuda medição (Phase 0) |
| **Critérios de entrada** | Plano sprint HTTP; lista de callers instances inventariada |
| **Critérios de saída** | Single-flight instances; Chat mount sem clients/leads until action |
| **Critérios de rollback** | PR revert |
| **Critérios de aceite** | Network: 1 fetch instances por ciclo; Chat UX OK |
| **Métricas esperadas** | −HTTP shell documentado % vs baseline |
| **Evidências** | HAR/trace; PR description com callers; `PHASE2_METRICS_MB008_010.md` |
| **Status oficial** | **CLOSED** (`docs/architecture/sprints/PHASE2_CLOSEOUT.md`, 2026-07-14) |

## Gate — Phase 3 SQL Hot Path

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Melhorar p95 list/messages |
| **Escopo** | MB-011, MB-012, MB-013 |
| **Pré-requisitos** | **Phase 2 closed**; EXPLAIN staging disponível |
| **Dependências** | F4 canário (MB-001/013) |
| **Critérios de entrada** | ADR se contrato API mudar; dataset staging |
| **Critérios de saída** | EXPLAIN before/after; dual-path ou cutover documentado; p95↓ |
| **Critérios de rollback** | Query legado ON / flag aggregated OFF |
| **Critérios de aceite** | QA inbox/groups/archived/messages pagination |
| **Métricas esperadas** | p95 inbox/messages vs baseline Phase 0 |
| **Evidências** | EXPLAIN plans; APM queries; relatório SQL; `PHASE3_BENCHMARKS_EXPLAIN.md` |
| **Status oficial** | **CLOSED** (`docs/architecture/sprints/PHASE3_CLOSEOUT.md`, 2026-07-14) |

## Gate — Phase 4 Workers & Logs

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Reduzir contenção CPU/I/O no processo API |
| **Escopo** | MB-014…MB-017 (podem ser sprints internas **sequenciais** dentro da fase) |
| **Pré-requisitos** | **Phase 3 closed** (ou waiver escrito se só logs — ainda exige Phase 2+) |
| **Dependências** | Topology deploy |
| **Critérios de entrada** | Plano processo workers; inventário timers |
| **Critérios de saída** | Log policy aplicada **ou** workers críticos isolados conforme plano; SLOs job |
| **Critérios de rollback** | Dual deploy / verbosity restore |
| **Critérios de aceite** | Jobs não “sumiram”; API p95 não piorou |
| **Métricas esperadas** | CPU API↓; log volume↓; lag workers dentro SLO |
| **Evidências** | Deploy notes; dashboards CPU; inventory workers; `PHASE4_WORKER_INVENTORY.md` |
| **Status oficial** | **CLOSED** (`docs/architecture/sprints/PHASE4_CLOSEOUT.md`, 2026-07-14) |

## Gate — Phase 5 Store / Legacy coexistence

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Reduzir dual-path **sem** reabrir freeze |
| **Escopo** | MB-018…MB-020, MB-030, MB-031, MB-038, MB-040 |
| **Pré-requisitos** | **Phase 4 closed** (sequência arquitetural MASTER); canário Store estável ≥ período acordado |
| **Dependências** | ADR-010; tracker legado |
| **Critérios de entrada** | ADR para qualquer toque Core (ex.: MB-019); plano Float |
| **Critérios de saída** | Tracker atualizado; sem nova SoT paralela; Float plano ADR se feito |
| **Critérios de rollback** | Flags OFF |
| **Critérios de aceite** | Paridade Chat/Float; unread estável |
| **Métricas esperadas** | % tenants canário; invalidate count↓ |
| **Evidências** | Tracker diff; ADR se houver; QA matrix; `PHASE5_*` |
| **Status oficial** | **CLOSED** (`docs/architecture/sprints/PHASE5_CLOSEOUT.md`, 2026-07-14) |

## Gate — Phase 6 React / UX structure

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Decompor monólitos UI com contratos estáveis |
| **Escopo** | MB-021…MB-023 |
| **Pré-requisitos** | **Phase 5 closed** |
| **Dependências** | STORE ON estável |
| **Critérios de entrada** | Mapa de extração Chat.tsx; budget LOC |
| **Critérios de saída** | Extractions sem mudança public API freeze; Profiler OK |
| **Critérios de rollback** | Branch revert |
| **Critérios de aceite** | Visual/regressão Chat; bundles |
| **Métricas esperadas** | LOC Chat.tsx↓; long tasks↓ |
| **Evidências** | `PHASE6_*`; `npm run build:crm` chunk sizes; LOC inventory |
| **Status oficial** | **CLOSED** (`docs/architecture/sprints/PHASE6_CLOSEOUT.md`, 2026-07-14) |

## Gate — Phase 7 Infrastructure observability

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Observabilidade produção para liberar F7 com dados |
| **Escopo** | MB-024, MB-025 |
| **Pré-requisitos** | **Phase 6 closed** **ou** waiver se Phase 6 adiada — **mínimo Phase 4 closed** + logs policy |
| **Dependências** | MB-014 |
| **Critérios de entrada** | Vendor/APM definido; budgets |
| **Critérios de saída** | Dashboards chat/HTTP/WS; error budget |
| **Critérios de rollback** | Sampling down |
| **Critérios de aceite** | Ops consegue ver regressão |
| **Métricas esperadas** | Cobertura traces %; alertas vivos |
| **Evidências** | `PHASE7_*`; `/metrics/platform`; alert policy |
| **Status oficial** | **CLOSED** (`docs/architecture/sprints/PHASE7_CLOSEOUT.md`, 2026-07-14) |

> **Nota de sequência:** Se Phase 6 for adiada por ROI, o waiver deve ser **escrito** no close-out Phase 5 e Phase 7 só avança com Phase 4 closed — nunca pula Phase 0–4.

## Gate — Phase 8 Scalability (F7)

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Multi-réplica WebSocket |
| **Escopo** | MB-026, MB-027 |
| **Pré-requisitos** | **Phase 7 closed** (métricas); F1 ON estável; Redis HA |
| **Dependências** | F7_READINESS; runbooks Redis |
| **Critérios de entrada** | ADR F7; Redis HA provisionado; sticky fallback plan |
| **Critérios de saída** | ≥2 réplicas; fan-out cross-node OK; dashboards sockets |
| **Critérios de rollback** | 1 réplica + adapter off |
| **Critérios de aceite** | Chaos disconnect; mensagem cross-node |
| **Métricas esperadas** | Delivery rate; sockets/replica |
| **Evidências** | ADR-012; `PHASE8_*`; cluster test 2 nodes |
| **Status oficial** | **CLOSED** (`docs/architecture/sprints/PHASE8_CLOSEOUT.md`, 2026-07-14) |

## Gate — Phase B (paralela controlada)

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Evoluir Billing/Acquisition/Ops sem cruzar Chat freeze |
| **Escopo** | MB-034, MB-035, MB-037 (+ items domínio nos planos SaaS) |
| **Pré-requisitos** | Bounded context claro; **não** depende do close de Phase N runtime **exceto** se compartilhar migration/deploy conflict |
| **Dependências** | ADRs billing/acquisition |
| **Critérios de entrada** | Sprint plan Phase B; declaração “zero touch Chat Core/ADR-010 surfaces” |
| **Critérios de saída** | Conforme plano domínio; sem diff em chat-core freeze paths |
| **Critérios de rollback** | Conforme ADR domínio |
| **Critérios de aceite** | Review paths touched ≠ chat freeze |
| **Métricas esperadas** | Próprias do domínio |
| **Evidências** | PR file list audit; domínio close-out |

### Regra de encerramento oficial

Uma fase só é **Closed** quando existir documento `PHASE_N_CLOSEOUT.md` (ou seção equivalente) com: critérios de saída checados, métricas, evidências, rollback testado ou justificado, e aprovação explícita.

## Gate Integrity Rules

As regras abaixo são **globais** e aplicam-se a todas as Phases (0–8 e B):

| Regra | Descrição |
|---|---|
| **Reabertura** | Nenhuma Phase poderá ser **reaberta** sem documento específico de reabertura (contexto, motivo, escopo incremental, riscos, aprovação). |
| **Mudança de escopo** | Mudanças de escopo exigem **revisão formal** do Sprint Plan **antes** de qualquer implementação adicional. |
| **MB IDs mid-sprint** | Qualquer alteração de MB IDs durante uma sprint exige **atualização do Sprint Plan** aprovada **antes** da implementação dos novos IDs. |
| **Arquitetura mid-sprint** | Alterações arquiteturais durante sprint exigem **ADR** quando aplicável (inclui áreas cobertas pelo ADR-010). |
| **Evidências obrigatórias** | Evidências fazem parte do Gate e **não** são opcionais. |
| **Sem evidências ⇒ sem CLOSED** | Ausência de evidências **impede** o status **Closed** da Phase e impede encerramento formal da sprint (ver ENGINEERING DEFINITION OF DONE). |

Violação de qualquer Gate Integrity Rule invalida o progresso rumo a **Closed** até correção documental e técnica.

---

# 11 — Master Roadmap (somente planejamento)

> **Bloqueio:** nenhuma Phase 1…8 inicia sem Gate da fase anterior **Closed**. Itens do MASTER BACKLOG só entram em sprint se `Status=Ready` **e** a fase correspondente estiver aberta (entrada do Gate satisfeita).

## Phase 0 — Critical Stabilization
| | |
|---|---|
| **Objetivo** | Parar sangria operacional: flags, migrations, incidentes inbox/archive, baselines |
| **Itens** | MB-001…MB-005, MB-033, MB-039 (O1, O2, O12, O13) |
| **Deps** | Nenhuma técnica profunda |
| **Risco** | Médio (canário Chat) |
| **Rollback** | Flags OFF; SQL reverse se repair data explícito |
| **ROI** | Máximo imediato |
| **Complexidade** | Baixa–Média |
| **Estimativa** | 1 sprint |
| **Gate** | Ver IMPLEMENTATION GATES — Phase 0 |

## Phase 1 — Runtime Shell & Bootstrap
| | |
|---|---|
| **Objetivo** | TTI e fan-out shell |
| **Itens** | MB-006, MB-007 (O5) |
| **Deps** | Phase 0 Closed |
| **Risco** | Médio Auth |
| **Rollback** | Feature gate |
| **ROI** | Alto |
| **Complexidade** | Média |
| **Estimativa** | 1 sprint |
| **Gate** | Phase 1 |

## Phase 2 — HTTP Dedup
| | |
|---|---|
| **Objetivo** | Cortar dups estruturais |
| **Itens** | MB-008…MB-010 (O3, O4) |
| **Deps** | Phase 1 Closed |
| **Risco** | Baixo |
| **Rollback** | PR |
| **ROI** | Alto |
| **Complexidade** | Baixa |
| **Estimativa** | 0.5–1 sprint |
| **Gate** | Phase 2 |

## Phase 3 — SQL Hot Path
| | |
|---|---|
| **Objetivo** | p95 inbox/messages |
| **Itens** | MB-011…MB-013 (O8) |
| **Deps** | Phase 2 Closed; F4 canário |
| **Risco** | Médio–Alto |
| **Rollback** | Dual query path |
| **ROI** | Alto |
| **Complexidade** | Alta |
| **Estimativa** | 1–2 sprints |
| **Gate** | Phase 3 |

## Phase 4 — Workers & Logs
| | |
|---|---|
| **Objetivo** | Contenção CPU + I/O |
| **Itens** | MB-014…MB-017 (O6, O9) |
| **Deps** | Phase 3 Closed; Deploy topology |
| **Risco** | Médio |
| **Rollback** | Dual deploy |
| **ROI** | Médio–Alto |
| **Complexidade** | Alta |
| **Estimativa** | 1–2 sprints |
| **Gate** | Phase 4 |

## Phase 5 — Store / Legacy coexistence (sem reabrir freeze)
| | |
|---|---|
| **Objetivo** | Reduzir dual-path **sem** quebrar ADR-010 |
| **Itens** | MB-018…MB-020, MB-030, MB-031, MB-038, MB-040 (O7) |
| **Deps** | Phase 4 Closed |
| **Risco** | Médio |
| **Rollback** | Flags |
| **ROI** | Médio |
| **Complexidade** | Média |
| **Estimativa** | Contínuo / 1 sprint focado |
| **Gate** | Phase 5 |

## Phase 6 — React / UX structure
| | |
|---|---|
| **Objetivo** | Decompor monólitos de UI **após** SoT estável |
| **Itens** | MB-021…MB-023 (O11) |
| **Deps** | Phase 5 Closed |
| **Risco** | Médio |
| **Rollback** | Branch |
| **ROI** | Médio longo prazo |
| **Complexidade** | Alta |
| **Estimativa** | 2+ sprints |
| **Gate** | Phase 6 |

## Phase 7 — Infrastructure observability
| | |
|---|---|
| **Objetivo** | Visibilidade produção |
| **Itens** | MB-024, MB-025 |
| **Deps** | Phase 6 Closed **ou** waiver escrito + Phase 4 Closed |
| **Risco** | Baixo–Médio |
| **Rollback** | Sampling down |
| **ROI** | Alto ops |
| **Complexidade** | Média |
| **Estimativa** | 1 sprint |
| **Gate** | Phase 7 |

## Phase 8 — Scalability (F7)
| | |
|---|---|
| **Objetivo** | Multi-réplica WS |
| **Itens** | MB-026, MB-027 (O10) |
| **Deps** | Phase 7 Closed; F1 ON; Redis HA |
| **Risco** | Alto |
| **Rollback** | 1 réplica |
| **ROI** | Escala |
| **Complexidade** | Alta |
| **Estimativa** | 2 sprints + ops |
| **Gate** | Phase 8 |

## Phase B (paralela) — Billing / Acquisition / Ops
| | |
|---|---|
| **Objetivo** | Continuar planos SaaS **sem** cruzar Chat freeze |
| **Itens** | MB-034, MB-035, MB-037 |
| **Deps** | Fronteiras de bounded context; Gate Phase B |
| **Risco** | Próprio domínio |
| **Nota** | Paralelo **somente** sem dependência arquitetural com a fase runtime ativa |
| **Gate** | Phase B |

---

# 12 — Priority Matrix

| Bucket | Itens (MB-*) |
|---|---|
| **Quick Wins** | MB-008, MB-009, MB-014, MB-004, MB-003/MB-039 |
| **High ROI** | MB-001, MB-006, MB-011/012, MB-002 |
| **Medium ROI** | MB-019, MB-015, MB-021 parcial |
| **Long Term** | MB-026/027, MB-028, MB-036 |
| **Technical Debt** | Dual SoT, monólitos, logs, workers colocalizados (MB-018…031) |
| **Architecture** | ADR-010; Phase B outbox (MB-037) |
| **Infrastructure** | Redis, workers, APM (MB-015, MB-024, MB-026) |
| **Scalability** | Phase 8 + DB pós-EXPLAIN |

> Priorização operacional: só IDs com `Status=Ready` **e** Gate da Phase aberto.


---

# 13 — Sequenciamento (por quê nesta ordem)

1. **Phase 0 primeiro** — sem flags/canário e baselines, qualquer otimização mede o caminho errado. **Gate bloqueia Phase 1.**  
2. **Shell/HTTP (1–2) antes de SQL (3)** — barato, reduz ruído para EXPLAIN.  
3. **SQL antes de workers profundos** — p95 Chat é majoritariamente query+payload.  
4. **Workers/logs (4) antes de F7 (8)** — CPU do node afetaria fan-out WS.  
5. **Store coexistence (5) com canário** — não reabre freeze; só reduz dual.  
6. **React split (6) tarde** — extrair monólito com contratos estáveis.  
7. **Observability (7) alimenta F7** — sem métricas, Redis rollout é cego.  
8. **F7 por último entre runtime** — depende Bridge único + HA.  
9. **Billing/Acquisition paralelo (Phase B)** — ownership separado; **EXECUTION POLICY** impede misturar com Chat Core.  
10. **Nunca** abrir duas Phases 0–8 em paralelo; itens só do MASTER BACKLOG da Phase aberta.


---

# 14 — Regression Risks

| Mudança futura | Regressão possível |
|---|---|
| Flag canário ON | Float/Chat paridade visual; unread drift |
| Auth parallel | Race features/flags vs Permissions |
| Instances single-flight | Race cold start empty unread |
| SQL reshape | Cursor/pagination; tags; groups |
| Worker isolation | Jobs “sumir” se deploy esquecer processo |
| Redis adapter | Missed events cross-node; sticky fail |
| Archive filter stricter | Conversa “sumiu” = foi para Arquivadas |
| Remoção legado precoce | Quebra tenants ainda OFF |

---

# 15 — Validation Strategy (sem executar agora)

| Fase | Validação futura |
|---|---|
| 0 | Checklist Network cold start; contagem instances=1; STORE canário smoke chat send/receive; SQL `wa_archived` counts; migrate order CI check |
| 1 | TTI/FCP staging; waterfall auth hops≤2 ou bundle |
| 2 | Trace instances únicos; Chat mount sem clients até ação |
| 3 | EXPLAIN before/after; p95 inbox/messages |
| 4 | CPU process profile; job lag SLOs |
| 5 | Tracker flags; shadow/parity residual 0 |
| 6 | React Profiler Chat; LOC budget pages |
| 7 | Log volume; APM error budgets |
| 8 | ≥2 réplicas WS fan-out test; chaos disconnect |

Critérios Chat certificados: `AUDIT_F6_PERFORMANCE_CERTIFICATION` + `PERFORMANCE_BASELINE_F6` (preencher células `?` live).

---

# 16 — Final Verdict

### A arquitetura atual está pronta para evoluções?
**Sim, de forma condicionada:** Chat Core **pronto e congelado**; runtime app-wide e escala WS **exigem Phase 0–4/8**. Não está “pronta” para otimizar às cegas sem canário de flags.

### Quais áreas devem ser congeladas?
- Chat Core / Domain Store / Commands / Repository / Bridge / Cursor / Window / Virt / Public hooks (**ADR-010** e freezes F6.8).
- Contratos públicos Chat (`PUBLIC_API_FREEZE`).
- Invariantes Billing ADR-001/002 (não reabrir sem ADR billing).

### Quais áreas devem ser reescritas?
- **Não** Domain Store (já SoT).  
- **Sim, incrementalmente:** SQL hot path list/messages; monólito `Chat.tsx` (extração); opcionalmente fatiar `chatController`; workers densos → processos.

### Quais áreas apenas precisam de otimização?
- Auth bootstrap, instances dedupe, Chat mount payloads, invalidate storms, logs, Float dump, attendance already-efficient paths.

### Quais áreas não devem ser alteradas?
- Contratos freeze sem ADR.  
- Remoção física de legado antes de canário.  
- Misturar F7 Redis com mudanças de schema Store.  
- “Otimizações” que reintroduzam SoT paralelo RQ+Store.

### Quais Architecture Freezes permanecem válidos?
| Freeze | Status |
|---|---|
| **ADR-010 Chat Architecture Freeze** | **Válido** |
| `F6_ARCHITECTURE_FREEZE_REPORT` | **Válido** |
| `DOMAIN_STORE_FREEZE` / `PUBLIC_API_FREEZE` | **Válidos** |
| `FEATURE_FLAGS_AUDIT` (no new flags sem ADR) | **Válido** |
| Performance Master “freeze all features” (Jun/2026) | **Parcialmente obsoleto** — substituído por freeze **Chat** + este MASTER para app-wide |
| F7 readiness | **Válido para início de desenho**; não para deploy sem Redis HA |

---

## Document supersession map

| Documento antigo | Papel após MASTER |
|---|---|
| Runtime audits (4) | Evidência anexada; números/cites prevalecem se atualizados |
| Chat F0–F6 reports | Histórico de entrega |
| CHAT_ENTERPRISE_MIGRATION_MASTER_PLAN | Histórico F7 section; sequência runtime → este MASTER |
| AUDIT_PERFORMANCE_MASTER_PLAN | Backlog UI/bundle remanescente fundido nas Phases 1/6 |
| IMPLEMENTATION_ROADMAP SaaS | Phase B paralela |
| Billing audits | Domain-owned; não reordenam Chat freeze |

---

## Assinatura

| Campo | Valor |
|---|---|
| **Documento** | MASTER_IMPLEMENTATION_PLAN |
| **Autor** | Principal Software Architect (consolidação automática evidenciada) |
| **Data** | 2026-07-14 |
| **Revisão** | Ver bloco completo de revisão no final do documento (Governance Completion) |
| **Alterações no sistema** | Nenhuma |
| **Próximo passo autorizado** | Somente planejamento/execução por sprint **após** aprovação explícita — **não** implícito neste arquivo |

---

# EXECUTION POLICY

Toda implementação futura deverá seguir **obrigatoriamente** as regras abaixo.

Este documento MASTER **não** autoriza código. Cada sprint exige um **documento de planejamento específico** antes de qualquer alteração (ver **SPRINT DOCUMENT TEMPLATE**).

## Política de domínio da sprint

Cada sprint deverá possuir obrigatoriamente um **domínio arquitetural principal**.

Alterações em **domínios secundários** somente serão permitidas quando forem **estritamente necessárias** para atingir o objetivo da sprint, estiverem **explicitamente documentadas** no Sprint Plan e **não ampliarem** o escopo originalmente aprovado.

Nenhuma alteração secundária poderá introduzir **novas funcionalidades**, **refactors independentes** ou **mudanças oportunistas**.

## Proibições absolutas

É **proibido**:

- violar a **política de domínio** da sprint (principal obrigatório; secundários só sob as condições acima);
- alterar **Backend, Frontend e Banco** simultaneamente sem justificativa técnica **escrita** no plano da sprint;
- executar **refactors** junto com **novas funcionalidades**;
- alterar componentes congelados pelo **ADR-010** sem **novo ADR**;
- remover código legado antes do **período mínimo de coexistência** definido nos audits / LEGACY tracker;
- alterar **Feature Flags** durante implementação **não relacionada**;
- misturar **otimizações** com **correções de bugs críticos**;
- iniciar itens de uma Phase N se a Phase N−1 **não** estiver **Closed** (IMPLEMENTATION GATES);
- executar **fases paralelas** com dependência arquitetural (Phases 0→8);
- misturar itens de Phase B com toques em Chat Core / freeze surfaces;
- implementar múltiplos IDs MB-\* **não** listados no plano da sprint ativa;
- “aproveitar o PR” para cleanups fora do escopo do Gate aberto;
- considerar sprint **CLOSED** sem atender à **ENGINEERING DEFINITION OF DONE**.

## Domínio principal e secundários (operacional)

| Papel | Regra |
|---|---|
| **Domínio principal** | Obrigatório em toda sprint; define o eixo da tabela operacional abaixo |
| **Domínio secundário** | Só se estritamente necessário ao objetivo; listado no Sprint Plan; sem ampliação de escopo; sem features novas; sem refactors independentes; sem oportunismo |
| **Violação** | Qualquer secundário fora dessas condições → sprint inválida |

## Obrigatórios por sprint

Cada sprint deverá produzir **obrigatoriamente**:

1. **Auditoria inicial** (escopo, baseline, riscos)  
2. **Plano técnico** da sprint (IDs MB-\*, domínio principal, secundários justificados, rollback, gates) — derivado do **SPRINT DOCUMENT TEMPLATE**  
3. **Implementação** (somente o plano aprovado)  
4. **QA** (casos + evidências)  
5. **Rollback Plan** (testável ou justificado)  
6. **Release Notes**  
7. **Auditoria pós-implementação** (métricas vs esperado + close-out parcial)  
8. Atualização de **KPIs afetados** (ou registro **No KPI Changes**) — ver **ENGINEERING KPI FRAMEWORK**  
9. Cumprimento da **ENGINEERING DEFINITION OF DONE** para status CLOSED  

## Arranque obrigatório

Toda implementação deverá começar **obrigatoriamente** por um documento de planejamento específico da sprint, derivado do **SPRINT DOCUMENT TEMPLATE**, por exemplo:

`docs/architecture/sprints/SPRINT_<fase>_<nome>_PLAN.md`

Contendo no mínimo as seções 1–20 do template (Objetivo → Phase Close-out).

Sem esse documento **aprovado**, é **proibido** alterar código, banco, flags ou migrations.

## Domínio — definição operacional

Para efeitos desta policy, o **domínio arquitetural principal** por sprint é **um** dos eixos:

| Domínio sprint | Exemplos permitidos |
|---|---|
| Chat FE (não-freeze) | Páginas Chat UX fora de Core public API |
| Chat Core (freeze) | **Somente** com ADR novo |
| Shell / Bootstrap FE | AuthContext, AppShell providers |
| Chat BE SQL | list/messages queries |
| Workers | Processos/timers |
| Infra / WS scale | Redis adapter |
| Billing | Planos billing |
| Acquisition | Signup/onboarding |

Dois eixos como **principais** na mesma sprint → **violação**.  
Eixo secundário permitido somente sob a política de domínio principal/secundários acima, com aceite explícito no Sprint Plan.

## Relação com Gates e Backlog

| Artefato | Papel |
|---|---|
| MASTER BACKLOG | Inventário; IDs rastreáveis |
| IMPLEMENTATION GATES | Libera / bloqueia Phase |
| EXECUTION POLICY | Como a sprint pode executar |
| Sprint PLAN | Contrato da sprint |
| ENGINEERING DEFINITION OF DONE | Critério CLOSED |
| ENGINEERING KPI FRAMEWORK | Métricas da sprint |
| ARCHITECTURE DECISION REGISTER | Decisões ADR |
| GOVERNANCE HIERARCHY | Precedência documental |

Violação de Gates, Policy ou Definition of Done → sprint inválida; mudanças devem ser revertidas ou formadas em plano corretivo.

---

# ARCHITECTURE DECISION REGISTER

## Objetivo

Esta seção é a **referência oficial** para decisões arquiteturais futuras do PainelCRM. Consolida a política de ADRs sob a autoridade do MASTER IMPLEMENTATION PLAN e liga decisões a Gates, Backlog e sprints.

## Política de uso

- Qualquer alteração arquitetural que **exigir ADR** deverá possuir **registro formal** (documento ADR + entrada rastreável neste registro / índice de ADRs).
- ADRs existentes relevantes (ex.: **ADR-010** Chat Freeze, ADR-001/002 Billing) permanecem válidos e devem ser referenciados por ID.
- Novos ADRs devem declarar impacto em MB-IDs, Gates/Phases e documentos da GOVERNANCE HIERARCHY.
- Nenhuma implementação que mude contratos, SoT, fronteiras de bounded context, freeze surfaces ou topologia de escala poderá iniciar sem ADR **Proposed → Accepted** quando a EXECUTION POLICY / ADR-010 exigir.

## Obrigatoriedade

É **obrigatório** abrir ADR quando, entre outros:

- alteração em áreas cobertas pelo **ADR-010** (Chat Core / Store / Commands / Repository / Bridge / Cursor / Window / Virt / Public API);
- mudança de contrato HTTP/SQL/WS público;
- introdução de nova SoT, dual-path ou feature flag estrutural;
- isolamento de workers / Redis / multi-réplica;
- qualquer item do MASTER BACKLOG com coluna **ADR? = Sim**.

## Fluxo de aprovação

```text
1. Draft ADR (Status: Proposed)
2. Revisão contra MASTER IMPLEMENTATION PLAN + Gates + Backlog
3. Aceite explícito (Status: Accepted) OU rejeição documentada
4. Implementação somente após Accepted (quando ADR obrigatório)
5. Se substituído: Status Superseded + ponte explícita para ADR sucessor
6. Se invalidado sem sucessor: Deprecated (com justificativa)
```

## Campos obrigatórios de cada ADR

| Campo | Descrição |
|---|---|
| **ID** | Identificador único (ex.: ADR-011) |
| **Data** | Data da proposta / aceite |
| **Autor** | Responsável técnico |
| **Contexto** | Situação e pressão que motivam a decisão |
| **Problema** | Problema concreto a resolver |
| **Alternativas consideradas** | Opções avaliadas (incluindo “não fazer”) |
| **Decisão** | Escolha adotada |
| **Consequências** | Positivas, negativas, follow-ups |
| **Plano de rollback** | Como reverter a decisão / implementação |
| **Documentos impactados** | MASTER, MB-IDs, Gates, flags, audits |
| **Status** | Ver enumeração abaixo |

## Status permitidos

| Status | Significado |
|---|---|
| **Proposed** | Em revisão; **não** autoriza implementação dependente |
| **Accepted** | Vigente; implementação permitida sob Gates/Policy |
| **Superseded** | Substituído por outro ADR **explicitamente** nomeado |
| **Deprecated** | Não deve mais ser seguido; sem sucessor automático |

## Regras de consistência

| Regra | Descrição |
|---|---|
| **MASTER prevalece** | Nenhum ADR poderá **contradizer** o MASTER IMPLEMENTATION PLAN. Em conflito, o ADR deve ser rejeitado ou o MASTER formalmente revisado **antes** do aceite. |
| **Sem prevalência automática por data** | Quando houver conflito entre ADRs, o mais recente **não** prevalece automaticamente; é obrigatória **supersession explícita** (`Superseded by ADR-XYZ`). |
| **Freeze ADR-010** | Qualquer alteração em áreas congeladas continua exigindo **novo ADR**, conforme ADR-010. |
| **Rastreio** | ADR Accepted deve atualizar MB-IDs / Sprint Plan / Phase Close-out quando aplicável. |

## Índice inicial (referência — não exhaustivo)

| ID | Título | Status | Notas |
|---|---|---|---|
| ADR-010 | Chat Architecture Freeze (F1–F6) | Accepted | Freeze Core; ver `docs/architecture/chat/ADR-010-CHAT-ARCHITECTURE-FREEZE.md` |
| ADR-001 | Billing Domain Invariants | Accepted | Domínio billing |
| ADR-002 | Subscription Cycle Materialization Policy | Accepted | Domínio billing |

Novos ADRs devem ser acrescentados a este índice (ou documento índice dedicado referenciado aqui) sem remover entradas históricas.

---

# ENGINEERING DEFINITION OF DONE

## Objetivo

Definir o critério oficial de **conclusão de sprint**. Uma implementação somente poderá ser considerada **concluída (CLOSED)** quando **todos** os itens abaixo estiverem atendidos.

## Checklist obrigatório

| # | Item | Obrigatório |
|---|---|---|
| 1 | Implementação concluída | Sim |
| 2 | Compilação sem erros | Sim |
| 3 | QA aprovado | Sim |
| 4 | Critérios do Gate atendidos | Sim |
| 5 | Sem regressões conhecidas | Sim |
| 6 | Rollback definido | Sim |
| 7 | Rollback validado **ou** tecnicamente justificado | Sim |
| 8 | Documentação atualizada | Sim |
| 9 | MASTER BACKLOG atualizado | Sim |
| 10 | Sprint Plan atualizado | Sim |
| 11 | Phase Close-out atualizado | Sim |
| 12 | Métricas coletadas | Sim |
| 13 | Evidências anexadas | Sim |
| 14 | Release Notes concluídas | Sim |
| 15 | Feature Flags documentadas | Sim |
| 16 | ADR atualizado (quando aplicável) | Sim (se aplicável); N/A documentado se não |
| 17 | KPIs afetados atualizados **ou** registrado **No KPI Changes** | Sim |

## Status oficial

| Situação | Status |
|---|---|
| Qualquer item do checklist pendente | **IN PROGRESS** |
| Todos os itens atendidos + Gate Integrity Rules satisfatórias | **CLOSED** elegível |

**Caso qualquer item permaneça pendente, o status oficial permanece IN PROGRESS e a sprint NÃO poderá ser considerada CLOSED.**

Uma Phase **não** pode ser marcada **Closed** se a sprint que a encerra permanecer IN PROGRESS.

---

# ENGINEERING KPI FRAMEWORK

## Objetivo

Framework oficial de métricas de engenharia. Toda sprint deverá atualizar os KPIs **afetados**. Quando não houver alteração esperada, registrar explicitamente: **No KPI Changes**.

## Política obrigatória

| Regra | Descrição |
|---|---|
| Atualização | Toda sprint atualiza KPIs do domínio tocado (baseline → after) |
| Ausência de mudança | Registrar **No KPI Changes** no Sprint Plan / pós-implementação |
| Evidência | Valores com fonte (Network, APM, EXPLAIN, Profiler, dashboard) |
| Gate | Métricas fazem parte das evidências do Gate / Definition of Done |

## Frontend

| KPI | Descrição / uso |
|---|---|
| Bootstrap Time | Tempo até shell utilizável pós-auth |
| TTI | Time to Interactive |
| FCP | First Contentful Paint |
| Bundle Size | Entry / layout chunks (gzip quando aplicável) |
| Requests Bootstrap | Contagem/hops HTTP no cold start |
| React Renders | Commits relevantes (Profiler) |
| Long Tasks | Tarefas > limiar (ex. 200ms) |
| Memory | Heap / retenção post-navegação |

## Backend

| KPI | Descrição / uso |
|---|---|
| p50 | Latência mediana endpoints no escopo |
| p95 | Latência p95 |
| p99 | Latência p99 |
| Error Rate | % erros 5xx / falhas de handler |
| Requests/min | Throughput |
| CPU | Uso processo API |
| RAM | Memória processo API |

## Banco

| KPI | Descrição / uso |
|---|---|
| Slow Queries | Contagem / duração acima limiar |
| Query Count | Queries por request / job |
| EXPLAIN regressions | Planos piores vs baseline |
| Locks | Contenção / waits |
| Connections | Uso do pool |

## Workers

| KPI | Descrição / uso |
|---|---|
| CPU | Uso processos worker |
| Delay | Lag vs schedule esperado |
| Queue | Profundidade / backlog |
| Retry | Tentativas / taxa |
| Failure Rate | Falhas permanentes |

## WebSocket

| KPI | Descrição / uso |
|---|---|
| Connections | CCU / conexões por nó |
| Reconnects | Taxa de reconexão |
| Lost Events | Eventos não entregues / detectados |
| Delivery Rate | Entrega cross-client / cross-node |
| Rooms | Cardinalidade / fan-out |

## Infra

| KPI | Descrição / uso |
|---|---|
| CPU | Host / container |
| RAM | Host / container |
| Deploy Time | Tempo pipeline / rollforward |
| Availability | Uptime / SLOs |
| Containers | Contagem / saúde |
| Scaling | Eventos de scale / capacidade |

## Observability

| KPI | Descrição / uso |
|---|---|
| Alertas | Volume / ruído / acertos |
| Log Volume | Volume / custo I/O |
| Trace Coverage | % requests com trace |
| Error Budget | Consumo do budget do serviço |

## Template de registro por sprint

| Campo | Valor |
|---|---|
| Sprint | … |
| KPIs medidos | lista |
| Before | … |
| After | … |
| **No KPI Changes** | Sim / Não (se Sim, justificar) |
| Fonte | … |

---

# SPRINT DOCUMENT TEMPLATE

## Objetivo

Template oficial que **toda** sprint deverá seguir. Nenhuma sprint poderá iniciar sem documento **derivado** deste template.

## Política

- Documento tipicamente em: `docs/architecture/sprints/SPRINT_<fase>_<nome>_PLAN.md`
- Deve existir **antes** de qualquer alteração de código, banco, flags ou migrations
- Deve ser **aprovado**; mudanças de escopo/MB IDs exigem revisão formal (Gate Integrity Rules)
- Ao encerrar, alimentar Definition of Done, KPIs, Backlog e Phase Close-out

## Estrutura mínima obrigatória

Copiar e preencher integralmente:

```markdown
# SPRINT PLAN — <FASE> — <NOME>

| Campo | Valor |
|---|---|
| Sprint ID | |
| Phase / Gate | |
| Domínio principal | |
| Domínios secundários (se houver) | Justificativa estrita / N/A |
| Autor | |
| Data | |
| Status | Draft / Approved / IN PROGRESS / CLOSED |

## 1 Objetivo

## 2 Escopo

## 3 MB IDs

## 4 Gate

## 5 Domínio

## 6 Dependências

## 7 Fora de Escopo

## 8 Arquivos previstos

## 9 Banco

(Alterações previstas: Nenhuma / lista. Proibido sem justificativa no plano.)

## 10 Feature Flags

(Quais flags toca; proibido alterar flags não relacionadas.)

## 11 ADR necessários

(Sim/Não + IDs Proposed/Accepted)

## 12 Plano Técnico

## 13 Plano de QA

## 14 Rollback

## 15 Critérios de Aceite

## 16 Evidências

## 17 Release Notes

(esqueleto; completar na entrega)

## 18 Pós Implementação

(auditoria pós; KPIs ou No KPI Changes)

## 19 Atualização MASTER

(Backlog status; referências)

## 20 Phase Close-out

(parcial / completo / N/A — com link ao PHASE_N_CLOSEOUT)
```

## Checklist de arranque

| Item | OK |
|---|---|
| Template completo (seções 1–20) | ☐ |
| Domínio principal definido | ☐ |
| Secundários justificados ou N/A | ☐ |
| MB IDs ⊂ Phase aberta + Ready | ☐ |
| Gate entrada satisfeito | ☐ |
| ADR Resolved se obrigatório | ☐ |
| Aprovação explícita | ☐ |

Sem este checklist → **proibido iniciar implementação**.

---

# GOVERNANCE HIERARCHY

## Objetivo

Hierarquia oficial de documentos técnicos. Define **precedência** em conflitos e impede que artefatos de sprint contradigam o MASTER.

## Precedência (maior → menor)

| Ordem | Artefato | Papel |
|---|---|---|
| **1** | **MASTER_IMPLEMENTATION_PLAN** | Referência máxima de governança técnica |
| **2** | **ADRs aceitos** | Decisões arquiteturais vigentes (Accepted) |
| **3** | **IMPLEMENTATION GATES** | Liberação sequencial de Phases |
| **4** | **EXECUTION POLICY** | Como executar sprints |
| **5** | **MASTER BACKLOG** | Inventário rastreável de trabalho |
| **6** | **Sprint Plans** | Contrato da sprint (template) |
| **7** | **Phase Close-out** | Encerramento formal da Phase |
| **8** | **Release Notes** | Comunicação da entrega |
| **9** | **Audits** | Evidência investigativa |
| **10** | **Documentação histórica** | Relatórios de sprint passados, planos superseded |

## Regras de conflito

| Regra | Descrição |
|---|---|
| **Não-contradição ascendente** | Nenhum documento de nível **inferior** poderá contradizer um documento **superior**. |
| **Correção obrigatória** | Quando houver conflito, o documento inferior deverá ser **atualizado** ou explicitamente **superseded**. |
| **ADRs vs MASTER** | ADR não pode contradizer o MASTER; ver ARCHITECTURE DECISION REGISTER. |
| **Supersession de ADR** | Conflito entre ADRs exige supersession **explícita**, não ordem cronológica implícita. |
| **Audits** | Audits informam o MASTER; não autorizam implementação nem invalidam Gates/Policy. |

## Diagrama resumido

```text
MASTER_IMPLEMENTATION_PLAN
  ├── ADRs Accepted
  ├── IMPLEMENTATION GATES (+ Integrity Rules)
  ├── EXECUTION POLICY
  ├── MASTER BACKLOG
  │     └── Sprint Plans (template)
  │           ├── Definition of Done → CLOSED / IN PROGRESS
  │           ├── KPI Framework
  │           └── Release Notes
  ├── Phase Close-out
  ├── Audits (evidência)
  └── Documentação histórica
```

---

## Assinatura (Governance Completion)

| Campo | Valor |
|---|---|
| **Documento** | MASTER_IMPLEMENTATION_PLAN |
| **Autor** | Principal Software Architect (consolidação automática evidenciada) |
| **Data** | 2026-07-14 |
| **Alterações no sistema** | Nenhuma |
| **Próximo passo autorizado** | Somente após Sprint Plan aprovado + Gate aberto + Definition of Done observável |

### Revisão

Esta revisão consolida a governança técnica máxima do projeto:

- MASTER BACKLOG  
- IMPLEMENTATION GATES  
- EXECUTION POLICY  
- ARCHITECTURE DECISION REGISTER  
- ENGINEERING DEFINITION OF DONE  
- ENGINEERING KPI FRAMEWORK  
- SPRINT DOCUMENT TEMPLATE  
- GOVERNANCE HIERARCHY  

Consolida também: arquitetura, backlog, gates, política de execução, rastreabilidade, critérios de conclusão, gestão de decisões arquiteturais, indicadores de engenharia, padronização de sprints e hierarquia documental.

---

**FIM DO MASTER IMPLEMENTATION PLAN**
