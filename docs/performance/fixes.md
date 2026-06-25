# P10 — Correções aplicadas (S0)

Todas baseadas em evidências da auditoria. Sem refactors cosméticos.

## 1. Deduplicar `useChatNavUnreadCount`

**Evidência:** Hook montado em `AppLayout.tsx` (sidebar) e `FloatingChatWidget.tsx` (bubble) — 2× `listInstances` + 2× `attendance-counts` no mount, 2× interval 120s.

**Fix:**
- `src/hooks/chatNavUnreadContext.tsx` — `ChatNavUnreadProvider` + `useSharedChatNavUnreadCount`
- `AppLayout.tsx` — provider único
- `FloatingChatWidget.tsx` — consome contexto

**Impacto esperado:** −50% requests de unread no shell; −1 interval timer.

## 2. Shell-first loading do AppLayout

**Evidência:** `RouteLoadingFallback` usa `min-h-screen` spinner → tela branca perceptível durante load de 306 KB AppLayout.

**Fix:**
- `src/components/AppShellLoadingFallback.tsx`
- `src/layouts/AppLayout.lazy.tsx` — fallback atualizado

**Impacto esperado:** FCP perceived melhor; `white_screen` reduzido no gap layout.

## 3. Prefetch Nav em idle

**Evidência:** `setTimeout(1500)` em Nav disparava 6+ preloads competindo com página atual.

**Fix:** `requestIdleCallback` com timeout 3s em `AppLayout.tsx` Nav effect.

**Impacto esperado:** Menos contenção de rede/CPU nos primeiros 2s pós-layout.

## Não implementado (aguarda métrica)

| Item | Motivo |
|------|--------|
| Unificar sockets Chat | Risco funcional alto |
| `invalidateQueries` floating-chat | Precisa teste regressão chat |
| Split AppLayout chunk | Refactor grande |
| Lazy FloatingChatWidget | UX — avaliar com métrica |
| Remover `useNotifications.ts` | Limpeza segura mas baixo impacto |

## Como medir ganhos

```bash
npm run analyze   # bundle
# Lighthouse / WebPageTest em /dashboard autenticado
# Network: contar requests attendance-counts nos primeiros 5s
```

Ver `before-after.md` para template de métricas.
