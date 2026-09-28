# P5 — Auditoria React Query

**Config global:** `src/lib/queryClient.ts`

```ts
staleTime: 5 min
gcTime: 15 min
refetchOnWindowFocus: false
refetchOnMount: false
refetchOnReconnect: false
retry: 1
```

## Adoção

- ~52 `useQuery`, 1 `useInfiniteQuery` (`Tasks.tsx`)
- **Assinaturas CRM** (`SubscriptionsList`, `SubscriptionDetail`) — **sem RQ** (`useEffect` manual)
- **Chat página** — estado manual; floating chat usa RQ intensivamente

## Polling (`refetchInterval`)

| Arquivo | Intervalo |
|---------|-----------|
| `ClientDriveFileManager.tsx` | 4s condicional (uploads) |

## Polling fora do RQ (duplica trabalho)

| Hook | Intervalo |
|------|-----------|
| `useInAppNotificationBadges` | 45s |
| `useChatNavUnreadCount` | 120s |
| `useTicketMenuCount` | 60s |
| `useSuperadminPlatformSupportSummary` | 60s |
| `ChatKanbanPage` | 20s full reload |

## Invalidações em cascata (alto impacto)

| Prefixo | Problema |
|---------|----------|
| `['floating-chat']` | Invalida **toda** subtree do chat flutuante |
| `['clients']` | Todas as queries de clientes |
| `['leads']` | Todas as variantes de lista |

**Exemplo:** `Chat.tsx` delete conversation invalida 7 keys incluindo redundâncias.

## staleTime overrides notáveis

| Valor | Uso |
|-------|-----|
| `0` + `refetchOnMount: always` | `ProjectFinance.tsx` |
| 5s | `EmbeddedLeadConversationPanel` messages |
| 30s | Vários widgets cliente/chat |
| 60s | Tasks, Agenda settings, prefetch nav |
| 3 min | Floating chat lists |

## Prefetch key mismatches

| Query live | Prefetch nav | Hit cache? |
|------------|--------------|------------|
| `dashboard-overview` + `preset` | sempre `current_month` | ❌ se preset ≠ |
| `leads` + sort/filter | `name/asc/all` | ❌ na maioria |

## Múltiplas chamadas iguais

- `members` — 4 cache keys diferentes (Agenda, Tickets, Projects, Kanban)
- `useChatNavUnreadCount` — **2 instâncias** (sidebar + bubble) → **corrigido S0** com `ChatNavUnreadProvider`

## Recomendações

### P0
1. Substituir `invalidateQueries(['floating-chat'])` por helpers em `floatingChatQueries.ts`
2. Escopar `['clients']` / `['leads']` nas invalidações do Chat

### P1
3. Unificar query key `members`
4. Alinhar prefetch keys com queries reais
5. Migrar badge hooks para RQ + event invalidation (eliminar `setInterval` paralelo)

### P2
6. Migrar assinaturas CRM para RQ (lista + detail + analytics)
