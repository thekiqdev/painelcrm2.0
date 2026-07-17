# SPRINT_TF7_E2_CLOSEOUT — TTL longo + skip GET quando fresco

| Campo | Valor |
|---|---|
| **Sprint** | TF7 · Etapa 2 |
| **Gate** | **CLOSED** (aguardando teste manual) |
| **Plano** | [`PLAN_TF7_WARM_STORE_CACHE.md`](./PLAN_TF7_WARM_STORE_CACHE.md) |
| **Predecessor** | [`SPRINT_TF7_E1_CLOSEOUT.md`](./SPRINT_TF7_E1_CLOSEOUT.md) |
| **Data** | 2026-07-16 |
| **Comando** | `ok etapa 2` |

---

## Resumo da entrega

`loadInboxCommand` deixa de ir à rede quando a inbox está **fresca** e o Store já tem rows. Freshness é **5 min** com WebSocket conectado e **30 s** se o realtime estiver down. `force: true` sempre busca. Chat e Float compartilham a mesma chave de freshness (sem `surface`).

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `INBOX_FRESH_TTL_MS` | **5 × 60_000** (WS connected) |
| `INBOX_FRESH_TTL_DISCONNECTED_MS` | **30_000** (realtime offline / not wired) |
| `INBOX_LOAD_TTL_MS` | Mantido **20_000** (compat TF6); skip real usa FRESH |
| `getEffectiveInboxFreshTtlMs()` | Escolhe TTL conforme `chatRealtimeBridge` / socket |
| Freshness key | Sem `surface` → Chat+Float não disparam 2º GET |
| `markInboxFreshFromClient` | Semeia freshness após warm E1 (F5 + disk `updatedAt`) |
| `readChatPageCacheUpdatedAt` | Expõe timestamp do `chatPageCache` |
| Chat `loadConversations` | Se `!force`, chama `markInboxFreshFromClient` com disk At |
| Testes | `store.tf7.e2-fresh-ttl.test.ts` (8) — todos OK |

---

## Política WS (2.4)

| Estado realtime | TTL efetivo | Motivo |
|---|---|---|
| `bridge.status === 'connected'` ou `socket.connected` | **5 min** | WS mantém lista via patches |
| Desconectado / idle / not_wired | **30 s** | Reduz janela de missed events |

---

## Fora desta etapa

| Item | Etapa |
|---|---|
| Botão “Atualizar” / limpar cache na UI | **E3** |
| Espelho contínuo WS → `localStorage` | **E3** |
| Seed de mensagens no disk com Store ON | **E3** |

---

## Checklist de teste (manual)

1. Abrir `/chat` → 1 GET `view=list&limit=50`.  
2. Navegar SPA e voltar ao chat em &lt; TTL → **sem** novo GET lista (ou só se force).  
3. Abrir Float com Chat já aberto → **sem** 2º GET lista.  
4. F5 em &lt; 5 min (WS up) → warm E1 + **skip GET** se disk fresco.  
5. Aguardar &gt; TTL (ou 30 s com WS down) → próximo open faz 1 GET.  
6. Refresh manual / `force` (se existir) → sempre GET.  
7. Msg inbound → preview via WS **sem** GET lista.

---

## Próximo

Validação manual → **`ok etapa 3`** (espelho cache + force sync UI).
