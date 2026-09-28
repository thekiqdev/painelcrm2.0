# P8 — Análise de Memória (estática)

> Heap snapshot DevTools não capturado em CI. Padrões identificados por revisão de código.

## Riscos de retenção

| Padrão | Local | Severidade |
|--------|-------|------------|
| Socket sem `off()` | `Chat.tsx`, `ClientProfile.tsx` | Alta |
| Interval pós-unmount | `WhatsAppConnection.tsx` | Alta |
| Module socket singleton | `realtimeClient.ts` | Baixa (by design) |
| RQ cache 15 min | Global | Média |
| Chat persist IDB | `chatPersistentCache` | Média |
| Floating chat panels state | `FloatingChatProvider` | Média |

## Listeners órfãos

- `Chat.tsx` manager `socket.io.on('error')` — não removido
- `useNotifications.ts` — código morto com reconnect manual

## Timers órfãos

| Arquivo | Timer | Cleanup? |
|---------|-------|----------|
| `WhatsAppConnection.tsx` | 5s poll | ❌ |
| `AuthWhatsApp.tsx` | resend cooldown | ⚠️ parcial |
| `FloatingChatProvider` | 500ms pulse | ✅ |
| `useChatNavUnreadCount` | 120s | ✅ |

## Componentes não desmontados

- `AppLayout` persiste entre rotas — **esperado**
- `FloatingChatProvider` mantém painéis abertos — **esperado** (UX) mas retém memória de conversas

## Sockets órfãos

Cenário: navegar Chat → sair sem cleanup adequado → socket dedicado pode persistir até GC do closure.

## Como validar

1. Chrome Memory → Heap snapshot antes/depois de 10 navegações Chat↔Dashboard
2. Filtrar `Detached HTMLElement`, `system / Context`
3. Performance monitor → JS heap size trend 5 min
4. Verificar `socket.io` connections em Network WS tab (deve ser ≤1 idealmente)

## Metas

| Critério | Estado |
|----------|--------|
| memory_leaks | ⚠️ Riscos em Chat/WhatsAppConnection |
| Listeners limpos | Parcial |
