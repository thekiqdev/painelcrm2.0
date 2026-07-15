# AUDIT_RUNTIME_INSTANCE_FLOW — AUD-110

| Campo | Valor |
|---|---|
| **Auditoria** | Phase 10C |
| **Data** | 2026-07-14 |

## Fluxo esperado

```
Instance Registry
  → Enabled
  → Connected
  → Conversation visibility
  → Chat / Floating / Kanban
```

## Fluxo real

```
GET /api/chat/instances
  → chatInstancesHttpCache (single-flight, TTL sessão)
  → ensureChatInstances
       ├─ Registry ON → cache registry
       └─ Registry OFF → return HTTP list
  → UI owners:
       ├─ Chat.tsx setInstances + pickEnabled → enabledInstanceIds
       ├─ FloatingChatProvider filterEnabled → instanceIds
       └─ FloatingWindow RQ filterConnected (só picker)
  → Inbox load:
       Chat/Float lists filtram por **enabled**, NÃO exigem connected
  → Domain Store instances slice: populate opcional / sombra
```

## Critérios de filtro

| Critério | Onde |
|---|---|
| `enabled_in_chat !== false` | Inbox Chat + Float list |
| `status connected\|open` **e** enabled | Float canal picker / composer switch |

## Listas independentes?

**Sim.**

- Chat mantém cópia local completa + Set enabled.  
- Floating mantém `instanceIds` próprio.  
- Window mantém query connected.  
- Não há um único “Instance Runtime” lido por todas as superfícies.

## Impacto em “conversa some no Float”

Se Chat e Float divergeirem em **quais instanceIds** foram passados a `loadInboxCommand` (timing, enable toggle, prefetch vs Chat hydrate), a Store recebe **replace** de listas com filtros diferentes → Float “perde” conversas que o Chat ainda mostra (ou o contrário). Race já documentada em Phase 10B.
