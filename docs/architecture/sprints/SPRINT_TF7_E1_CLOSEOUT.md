# SPRINT_TF7_E1_CLOSEOUT — Warm Store a partir do chatPageCache

| Campo | Valor |
|---|---|
| **Sprint** | TF7 · Etapa 1 |
| **Gate** | **CLOSED** (aguardando teste manual) |
| **Plano** | [`PLAN_TF7_WARM_STORE_CACHE.md`](./PLAN_TF7_WARM_STORE_CACHE.md) |
| **Auditoria** | [`AUDIT_TF7_WARM_STORE_CACHE.md`](./AUDIT_TF7_WARM_STORE_CACHE.md) |
| **Data** | 2026-07-16 |
| **Comando** | `ok etapa 1` |

---

## Resumo da entrega

Com `CHAT_CORE_STORE` ON, o Chat **hidrata o Domain Store** a partir do `localStorage` (`chatPageCache`) no `useLayoutEffect` — lista (e msgs da última conversa, se houver) aparecem sem esperar a rede. O **GET de inbox continua** em background (skip/TTL longo = E2).

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `warmInboxFromPageCache` | Novo helper em `src/features/chat-core/core/warmInboxFromPageCache.ts` |
| Chat.tsx Store ON | Early-return removido; chama warm + restaura `lastConversationId` |
| Seed pós-GET | `saveChatPageConversations` também com Store ON (senão o warm nunca teria dados) |
| Store OFF | Path legado de warm **inalterado** |
| filtersKey | Cache só aplica se a chave bater (sem warm cruzado) |
| onlyIfEmpty | Não sobrescreve Store já hidratada na sessão |
| Testes | `store.tf7.e1-warm-cache.test.ts` (4) — todos OK |

---

## Fora desta etapa (próximas)

| Item | Etapa |
|---|---|
| Skip GET quando fresco (TTL ~5 min) | **E2** |
| Espelho contínuo WS → disk + force UI | **E3** |
| Seed de mensagens no cache com Store ON | **E3** (warm de msgs já lê se o cache existir) |

---

## Checklist de teste (manual)

1. Abrir `/chat` com Store ON → 1 GET `view=list&limit=50` → lista OK (cache gravado).  
2. **F5** imediato → lista aparece **antes** (ou junto) do GET completar (warm).  
3. Network: ainda há **1 GET** agregada (esperado na E1).  
4. Trocar filtro (ex. “minhas”) → sem lista do filtro anterior vinda do cache errado.  
5. Store OFF (se testável) → warm legado continua igual.

---

## Próximo

Validação manual → **`ok etapa 2`** (TTL longo + skip GET quando fresco).
