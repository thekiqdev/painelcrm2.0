# AUDIT_TF8 — Shell load / escala pós-TF7 (F5 storm residual)

| Campo | Valor |
|---|---|
| **Documento** | Auditoria / gap analysis |
| **Data** | 2026-07-16 |
| **Predecessor** | [`SPRINT_TF7_CLOSEOUT.md`](./SPRINT_TF7_CLOSEOUT.md) |
| **Successor** | [`PLAN_TF8_SHELL_LOAD_SCALE.md`](./PLAN_TF8_SHELL_LOAD_SCALE.md) |
| **Preflight** | [`AUDIT_TF8_PREFLIGHT_RISKS.md`](./AUDIT_TF8_PREFLIGHT_RISKS.md) |
| **Tipo** | Performance FE (+ coalesce leve); SQL/schema/WS protocol **fora** |
| **Meta produto** | Escala tipo chat enterprise (1000+ operadores) |

---

## Contexto

TF6 cortou pressão da inbox (`limit=50`, shadow fail-safe, coalesce).  
TF7 adicionou warm local + TTL + espelho WS + force manual.

Evidência F5 local (2026-07-16): **ainda há rajada de GETs**. A lista `limit=50` às vezes volta (WS down → TTL 30 s). O volume dominante **não** é só a inbox — é shell + dashboard + warmup de msgs + polls.

---

## Achados (do log F5)

### A — Inbox / TF7 residual

| Sintoma | Causa provável |
|---|---|
| GET `view=list&limit=50` no F5 | No reload o WS desconecta; `getEffectiveInboxFreshTtlMs()` cai para **30 s** → `markInboxFreshFromClient` rejeita disk “velho” → GET |
| GET `limit=4` paralelo | Bubble Float (React Query) — fora do freshness da Domain Store |
| GET `attendanceFilter=mine` / `unreadOnly=1` | Outras chaves de filtro (esperado se UI dispara) |

### B — Shell / chat-adjacent (maior QPS residual)

| Endpoint | Padrão no log |
|---|---|
| `/api/chat/operations-dashboard` | **×3–6** por F5 |
| `/api/tickets/menu-count` | repetido |
| `/api/notifications/unread-count` | repetido |
| `/api/chat/kanban/tags` | repetido |
| `/api/ticket-categories` | repetido |
| `/api/chat/conversations/attendance-counts` | ×2+ |

### C — Thread open / warmup

| Endpoint | Padrão |
|---|---|
| `/messages?limit=50&latest=1` | **N conversas** em sequência (warmup / open pipeline) |

### D — Auth / bootstrap (menor prioridade TF8)

`auth/me` ×2, features ×2, migration-flags, runtime-config, instances — necessários no boot; dedupe leve se trivial.

---

## Impacto em escala (1000+ users)

```
QPS ≈ users × (F5/hora) × (GETs por F5)
```

Com 5× `operations-dashboard` + N× messages + polls de badge, o banco sofre **antes** da lista de conversas.  
Grandes chats: **paint local → WS → reconcile raro**; shell com **TTL / single-flight**.

---

## Gaps → TF8

| # | Gap | Etapa sugerida |
|---|---|---|
| G1 | F5 skip frágil com WS reconnect (TTL 30 s) | E1 |
| G2 | `operations-dashboard` sem single-flight / TTL de sessão | E2 |
| G3 | Warmup de msgs sem cap agressivo | E3 |
| G4 | Polls shell (tickets/notif/tags) sem coalesce compartilhado | E4 |
| G5 | Bubble `limit=4` fora do contrato Store/fresh | E4 ou polish |

---

## Fora de escopo desta auditoria

- Remoção física Store OFF (MB-028)  
- Redis cache server-side da lista  
- Mudança de protocolo Socket  
- Rewrite SQL do agregado  

---

## Conclusão

TF8 = **fechar o residual do F5** e alinhar o shell ao mesmo espírito do TF7 (cache/TTL/single-flight), para o produto se comportar como chat escalável.

Comando: `ok etapa 1` — ver [`PLAN_TF8_SHELL_LOAD_SCALE.md`](./PLAN_TF8_SHELL_LOAD_SCALE.md)
