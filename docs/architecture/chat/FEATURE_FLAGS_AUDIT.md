# FEATURE_FLAGS_AUDIT — Inventário completo Chat Migration

| Campo | Valor |
|---|---|
| **Documento** | FEATURE_FLAGS_AUDIT |
| **Data** | 2026-07-13 |
| **Sprint** | F6.8 |
| **Fonte** | `src/lib/chatMigrationFlags/catalog.ts`, `feature-flags.ts` |
| **Default global catalog** | **todas `false`** |

---

## Legenda de remoção

| Quando remover | Significado |
|---|---|
| **Manter DEV** | Observabilidade / shadow — não apagar |
| **Pós-canário Fn** | Flag ON estável em produção + período acordado |
| **Após F7** | Depende Redis / multi-réplica |
| **Stub** | Hardcoded false — consolidar na F7 / cleanup flags |

---

## Catalogo (Super Admin)

| Flag | Sprint | Default | Responsável (módulo) | Rollout | Remover |
|---|---|---|---|---|---|
| `CHAT_SINGLE_SOCKET` | F1 | OFF | `realtime/bridge` | Canário F1 | Pós-canário F1; revisar pós-F7 sticky |
| `CHAT_WS_PATCH_MESSAGE` | F2 | OFF | `ws-patch` | Por sub-flag | Pós-F2 (bypass se STORE ON) |
| `CHAT_WS_PATCH_CONVERSATION` | F2 | OFF | `ws-patch` | idem | Pós-F2 |
| `CHAT_WS_PATCH_MESSAGE_UPDATED` | F2 | OFF | `ws-patch` | idem | Pós-F2 |
| `CHAT_WS_PATCH_DELETE` | F2 | OFF | `ws-patch` | idem | Pós-F2 |
| `CHAT_WS_PATCH_ATTENDANCE` | F2 | OFF | `ws-patch` | idem | Pós-F2 |
| `CHAT_INSTANCE_REGISTRY` | F3 | OFF | instance registry | F3 | Pós-F3 |
| `CHAT_UNREAD_ENGINE` | F3 | OFF | unread-engine | F3 | Pós-F3 |
| `CHAT_ATTENDANCE_RECONCILE` | F3 | OFF | reconcile | F3 | Pós-F3 |
| `CHAT_AGGREGATED_FLOAT` | F4 | OFF | conversations repository | por superfície | Pós-F4b unificar |
| `CHAT_AGGREGATED_LEAD` | F4 | OFF | idem | idem | Pós-F4b |
| `CHAT_AGGREGATED_SIDEBAR` | F4 | OFF | idem | idem | Pós-F4b |
| `CHAT_AGGREGATED_CHAT` | F4 | OFF | idem | idem | Pós-F4b |
| `CHAT_AGGREGATED_API_SHADOW` | Dev | OFF | backend shadow | staging | Pós-paridade |
| `CHAT_AGGREGATED_DEV_LOG` | Dev | OFF | backend logs | DEV | **Manter DEV** |
| `CHAT_CORE_METRICS` | Dev / Prod canary | OFF | `metrics/*` + MB-025 policy | DEV: flag; Prod: flag **ou** `VITE_CHAT_METRICS_PROD=1` + sample rate | Sampling policy (Phase 7) |
| `CHAT_CORE_STORE` | F5–F6 | OFF | Domain Store SoT | canário longo | Pós-canário F6 |

---

## Stubs (não estão no catalog manager)

| Flag | Sprint | Default | Rollout | Remover |
|---|---|---|---|---|
| `CHAT_INBOX_CURSOR` | F6 map | always `false` | F6 features usam `CHAT_CORE_STORE` | Consolidar / eliminar stub |
| `CHAT_REDIS_WS` | F7 | OFF (catalog) | `feature-flags` + backend adapter | Canário multi-réplica; OFF = memory |

---

## Alias / derivados

| Alias | Comportamento |
|---|---|
| `CHAT_WS_PATCH` (fase estável) | true se **todas** as 5 sub-flags ON |
| `CHAT_AGGREGATED_CONVERSATIONS` | OR das 4 superfícies agregadas |

---

## Combinação certificada (runtime validation)

| Flag | Valor recomendado certificação |
|---|---|
| `CHAT_CORE_STORE` | ON |
| `CHAT_SINGLE_SOCKET` | ON |
| Aggregated CHAT (+ sidebar/float conforme superfície) | ON |
| `CHAT_CORE_METRICS` | ON em DEV/test; em prod só com sampling (`VITE_CHAT_METRICS_PROD` / flag + `VITE_CHAT_METRICS_SAMPLE_RATE`) |

---

## Freeze de flags

- **Nenhuma flag nova** na F6.8.
- Novas flags → ADR + entrada em `catalog.ts` + painel Super Admin.
- Remoção física de branch legado → PR dedicado + tracker `REMOVE_READY`.
