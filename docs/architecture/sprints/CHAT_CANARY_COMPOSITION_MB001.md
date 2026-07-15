# Chat Feature Flags — Official Canary Composition (MB-001)

| Campo | Valor |
|---|---|
| **MB** | MB-001 |
| **Sprint** | Phase 0 Critical Stabilization |
| **Data** | 2026-07-14 |
| **Autoridade** | MASTER_IMPLEMENTATION_PLAN + FEATURE_FLAGS_AUDIT |

## Política

- Defaults do **catalog** permanecem **OFF** (sem alteração de código do catalog nesta sprint).
- Canário é **operacional**: ativação via Super Admin / painel de migration flags **por tenant/ambiente**.
- Esta sprint **não** altera Store, Repository, Commands, nem contratos.

## Composição certificada (canário)

| Flag | Valor canário |
|---|---|
| `CHAT_SINGLE_SOCKET` | **ON** |
| `CHAT_WS_PATCH_MESSAGE` | **ON** (ou pacote F2 completo) |
| `CHAT_WS_PATCH_CONVERSATION` | **ON** |
| `CHAT_WS_PATCH_MESSAGE_UPDATED` | **ON** |
| `CHAT_WS_PATCH_DELETE` | **ON** |
| `CHAT_WS_PATCH_ATTENDANCE` | **ON** |
| `CHAT_AGGREGATED_CHAT` | **ON** |
| `CHAT_AGGREGATED_SIDEBAR` | **ON** (se usado) |
| `CHAT_AGGREGATED_FLOAT` | **ON** (se Float no canário) |
| `CHAT_CORE_STORE` | **ON** |
| `CHAT_CORE_METRICS` | **ON somente DEV/test** |
| `CHAT_INSTANCE_REGISTRY` / Unread / Reconcile | **ON** recomendado com F3 |

## Rollout

1. Staging: ligar composição acima.  
2. Smoke: ver Runbook MB-005.  
3. Produção: cohort pequeno → expandir.  
4. Rollback: desligar flags (ordem inversa recomendada: STORE por último se possível; se necessário OFF em lote).

## Evidência

Painel Super Admin / API migration-flags; sem commit de defaults ON.
