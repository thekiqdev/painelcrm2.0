# PHASE9_RUNTIME_FLOW

| Campo | Valor |
|---|---|
| **Sprint** | Phase 9 |
| **Data** | 2026-07-14 |

---

## Fluxo alvo (aceite)

```
Login
  → Bootstrap HTTP (instances, attendance, flags, config estáticos)
  → Store / engines hidratados
  → Socket.IO conectado (Realtime Bridge F1)
  → Eventos WS → patch Store / UI / unread engine
  → Render
```

HTTP permitido após bootstrap:

| Gatilho | Exemplos |
|---|---|
| Abrir conversa | GET messages (primeira página) |
| Paginação | scroll / older page |
| Sync manual | “Sincronizar conversas”, sync conversa, refresh identidade |
| Atualizar instância | toggle enabled / patch instance |
| F5 / remount | bootstrap de novo |
| Inconsistência pontual | instância removida → reconcile one-shot |

HTTP **proibido** como loop contínuo para:

Conversations list · Attendance counts · Ops dashboard · Unread · Instances · Runtime config · Migration flags · Kanban tags · Ticket categories · Clients/Leads/Company (escopo Chat refresh).

---

## Paths runtime pós-Phase 9

### 1. Login / bootstrap

`bootstrapChatF3Session` → `requestChatReconcile('all','login')` + Store session.  
Sem `startChatUnreadPeriodicReconcile` ativo.  
Sem reconcile em `visibilitychange` / `online`.

### 2. Mensagem nova (incoming/outgoing)

Socket `message_created` / window event → unread engine incremental + Store/WS-patch → UI.  
**Sem** GET messages só porque chegou evento de conversa.

### 3. Attendance / unread

Socket `conversation_attendance_updated` / conversation payload → `applyChatUnreadFromConversationPayload` → contadores locais.  
GET attendance só login, manual, archive pós-ação (manual), inconsistência.

### 4. Operations / SLA UI

Uma carga `getOperationsDashboard` por sessão/tenant para badges SLA.  
Sem tick periódico. Painel operacional (se usado) só mount + botão **Atualizar**.

### 5. Kanban Chat

Sem reload 20s. Board atualiza por navegação/ação/Socket conforme superfície já existente.

### 6. Caches sessão

`chatInstancesHttpCache` / `tenantCompanyHttpCache`: TTL 24h; invalidate logout / mutação.  
Hit/miss → métricas Phase 9.

### 7. Floating

Pulse 500ms: limpeza de highlight local — **não** dispara HTTP.

---

## React Query (MB-046)

Defaults globais (`queryClient`):

- `refetchOnWindowFocus: false`
- `refetchOnReconnect: false`
- `refetchOnMount: false`

Invalidate Chat em cascata automática por focus/reconnect **não** é o caminho de refresh.
