# SPRINT_PHASE1_RUNTIME_SHELL_BOOTSTRAP_PLAN

| Campo | Valor |
|---|---|
| **Documento** | SPRINT_PHASE1_RUNTIME_SHELL_BOOTSTRAP_PLAN |
| **Phase** | 1 — Runtime Shell & Bootstrap |
| **Base** | MASTER_IMPLEMENTATION_PLAN |
| **Status** | Completed |
| **Data** | 2026-07-14 |
| **Gate anterior** | Phase 0 CLOSED (`PHASE0_CLOSEOUT.md`) |
| **Implementação** | Autorizada somente neste escopo |
| **Closeout** | `PHASE1_CLOSEOUT.md` — Gate Phase 1 **CLOSED** |

---

## Objetivo

Reduzir o tempo de bootstrap da aplicação e melhorar o TTI até o AppShell, atuando **apenas** no Shell / Bootstrap (auth + lazy soft do shell).

## Fonte de verdade

- MASTER_IMPLEMENTATION_PLAN
- IMPLEMENTATION_GATES · EXECUTION_POLICY
- ADR-010 · PUBLIC_API_FREEZE · DOMAIN_STORE_FREEZE
- PHASE0_CLOSEOUT

## Escopo autorizado

| MB | Título | Obrigatório |
|---|---|---|
| MB-006 | Auth bootstrap — eliminar waterfall me→features→flags | Sim |
| MB-007 | Soft-lazy Brand / Unread no AppShell | Sim (iniciado: fan-out HTTP pós-auth no shell) |

Nenhum outro MB. Proibido Chat Core / Store / SQL / Workers / Phase 2.

## Plano técnico

### MB-006

- Após `GET /api/auth/me` OK: paralelizar `GET /api/auth/me/features` + `GET /api/chat/migration-flags` via `Promise.all`.
- Remover refetch redundante de features no `signIn` (já coberto por `fetchCurrentUser`).
- Preservar: segurança, multi-tenant, permissões, feature keys, contracts HTTP.
- Instrumentar marks DEV `perf:auth-*` para medição before/after.

### MB-007

- `TenantBrandProvider`: adiár `GET /api/me/tenant/company` até idle (timeout seguro).
- `ChatNavUnreadScope`: adiár enable do unread (instances + attendance-counts) até idle.
- Não atrasar Login / Auth / Permissions / navegação.

## Critérios de saída

- Hops serial auth pós-`/me`: **1 estágio paralelo** (features ∥ flags) — total ≤2 hops serials.
- Sem regressão login / permissions / flags / nav.
- Métricas reais documentadas + PHASE1_CLOSEOUT.
- Gate Phase 1 → CLOSED.

## Rollback

Reverter alterações em AuthContext / TenantBrandContext / ChatNavUnreadScope; flags/catalog inalterados.
