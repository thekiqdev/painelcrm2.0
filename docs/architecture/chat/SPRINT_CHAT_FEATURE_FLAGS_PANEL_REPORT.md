# SPRINT — Painel Super Admin: Feature Flags da Migração Chat

| Campo | Valor |
|---|---|
| **Data** | 2026-07-08 |
| **Escopo** | UI Super Admin + persistência + substituição de `.env` |
| **Rota** | `/superadmin/avancado/feature-flags/chat-optimization` |

---

## 1. Objetivo

Centralizar o controle das Feature Flags da migração arquitetural do Chat (F1–F4) no painel Super Admin, eliminando `.env` como fonte de verdade para estas flags.

---

## 2. Arquivos criados

| Arquivo | Função |
|---|---|
| `packages/backend/src/services/chatMigrationFlags/keys.ts` | Chaves oficiais (16 flags) |
| `packages/backend/src/services/chatMigrationFlags/service.ts` | Persistência + cache em memória |
| `packages/backend/src/services/chatMigrationFlags/service.test.ts` | Testes unitários |
| `packages/backend/src/controllers/chatMigrationFlagsController.ts` | GET público autenticado |
| `packages/backend/src/controllers/superadminChatMigrationFlagsController.ts` | GET/PATCH Super Admin |
| `src/lib/chatMigrationFlags/catalog.ts` | Grupos F1–F4 + descrições UI |
| `src/lib/chatMigrationFlagManager.ts` | **Feature Flag Manager** frontend |
| `src/pages/superadmin/SuperAdminChatMigrationFlagsPage.tsx` | Tela com switches por sprint |

---

## 3. Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `feature-flags.ts` | Lê do `chatMigrationFlagManager` |
| `chatAggregatedFlags.ts` | Lê do manager |
| `chatConversationsMetrics.ts` | `CHAT_CORE_METRICS` via manager |
| `metrics/baseline.ts` | Idem |
| `AuthContext.tsx` | Bootstrap `loadChatMigrationFlags` no login |
| `superadminRoutes.ts` | Rotas admin |
| `chatRoutes.ts` | `GET /api/chat/migration-flags` |
| `chatAggregatedConversations/featureFlags.ts` | Re-export do service |
| `App.tsx`, nav, hub, feature flags page | Rotas e links |
| Testes F2/F3/F4a | `setChatMigrationFlagsForTests` |

---

## 4. API

| Método | Rota | Auth | Uso |
|---|---|---|---|
| GET | `/api/chat/migration-flags` | CRM autenticado | Bootstrap do manager no cliente |
| GET | `/api/superadmin/advanced/chat-migration-flags` | Super Admin | Painel |
| PATCH | `/api/superadmin/advanced/chat-migration-flags/:key` | Super Admin | `{ "enabled": true }` |

**Persistência:** `superadmin_settings.key = 'chat_migration_flags'` (JSON).

**Auditoria:** `chat_migration_flag.updated` em `super_admin_audit_log`.

---

## 5. Flags no painel (16)

| Grupo | Flags |
|---|---|
| **F1** | `CHAT_SINGLE_SOCKET` |
| **F2** | `CHAT_WS_PATCH_MESSAGE`, `_CONVERSATION`, `_MESSAGE_UPDATED`, `_DELETE`, `_ATTENDANCE` |
| **F3** | `CHAT_INSTANCE_REGISTRY`, `CHAT_UNREAD_ENGINE`, `CHAT_ATTENDANCE_RECONCILE` |
| **F4** | `CHAT_AGGREGATED_FLOAT`, `_LEAD`, `_SIDEBAR`, `_CHAT` |
| **Desenvolvimento** | `CHAT_AGGREGATED_API_SHADOW`, `CHAT_AGGREGATED_DEV_LOG`, `CHAT_CORE_METRICS` |

**Backend API agregada:** `isChatAggregatedConversationsEnabled()` = **true** quando qualquer flag F4 de superfície está ON (sem flag `.env` separada).

---

## 6. Fluxo

```
Super Admin (switch ON/OFF)
        ↓ PATCH
superadmin_settings (JSON)
        ↓ cache backend (5s TTL)
GET /api/chat/migration-flags
        ↓ login / refresh
chatMigrationFlagManager (frontend)
        ↓
feature-flags.ts · chatAggregatedFlags.ts · metrics
```

---

## 7. Comportamento

- **Default:** todas OFF (igual ao pré-painel com `.env` vazio).
- **Rollback:** desligar switch no painel — efeito imediato após refresh do cache cliente.
- **`.env`:** **não é mais consultado** para estas 16 flags.
- Flags F5–F7 (`CHAT_CORE_STORE`, etc.) **fora do escopo** — permanecem desligadas.

---

## 8. Navegação

`Super Admin → Avançado → Feature Flags → Otimização do Chat`

Também acessível via card na página de Feature Flags e hub Avançado.

---

## 9. Testes

- `packages/backend/src/services/chatMigrationFlags/service.test.ts`
- `chatAggregatedConversations.test.ts` (atualizado)
- `chat-core.f2.test.ts`, `chat-core.f3.test.ts` (atualizado)

---

## 10. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Sessões antigas sem refresh de flags | Reload após login; `refreshChatMigrationFlagsFromServer` no PATCH admin |
| Cache backend 5s | TTL curto; invalidação imediata no PATCH |
| Superadmin sem login CRM | Painel PATCH atualiza manager local na mesma sessão |

---

*A ativação oficial das flags F1–F4 do Chat passa a ser exclusivamente pelo painel Super Admin.*
