# PHASE10A_RUNTIME_STATE_REPORT

| Campo | Valor |
|---|---|
| **Data** | 2026-07-14 |
| **Sprint** | Phase 10A |

---

## Antes → Depois

### Add Lead / Link / Create Client / Convert / Unlink

```
ANTES
POST link → retorno ignorado ou setConversations (no-op SoT)
  → loadConversations (GET inbox)
  → loadConversationProfile
  → effect CRM lia `conversations` local → wipe currentLead

DEPOIS
POST link → updated
  → applyChatCrmConversationUpdate(updated)
       Store ON: applyStoreConversationUpsert
       Store OFF: setConversations map
  → loadConversationProfile(updated.id)
  → effect CRM lê selectedConversation (SoT/view)
```

### Archive / Unarchive

Patch imediato via mesmo helper; **removido** `loadConversations` pós-ação. Attendance counts ainda podem forçar GET pontual (contador, não lista CRM).

### Padrão arquitetural único

`applyChatCrmConversationUpdate` + `refreshCrmProfileAfterConversationChange` em `Chat.tsx`.

---

## Handlers corrigidos

| Handler | Store update | Profile | Sem loadConversations p/ UI |
|---|---|---|---|
| `handleAddLead` | upsert `updated` | sim | ✅ |
| `handleConfirmLink` | upsert | sim | ✅ |
| `handleConfirmUnlink` | upsert | sim | ✅ |
| `handleCreateClientFromConversation` | upsert | sim | ✅ |
| `handleConvertToClient` | upsert via link client | sim | ✅ |
| `handleToggleWaArchive` | upsert patched | n/a | ✅ |
| `handleSystemDeleteConversation` | `applyStoreConversationRemove` | clear | ✅ |
| Tag add/remove | upsert tags | n/a | ✅ |
| `handleSyncConversation` / identity | upsert retorno | profile | GET só se sem conversation no sync |
| `handleMarkConversationRead` / select mark-read | upsert unread 0 | — | ✅ |

---

## CRM effect

| Antes | Depois |
|---|---|
| `conversations.find(id)` (legado stale sob SoT) | `selectedConversation` (Store/view) |
| Wipe se local unlinked enquanto Store linked | Wipe só se SoT/view realmente unlinked |
| — | Early return se selection ainda não alinhada (sem wipe) |

---

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/Chat.tsx` | Helper + handlers + CRM effect |
| `src/features/chat-core/store/public.ts` | Export `applyStoreConversationUpsert` / `Remove` (API existente) |

---

## Equivalência Floating

Floating: `applyFloatingCrmPatch(updated)` no RQ.  
Chat: `applyStoreConversationUpsert(updated)` na Domain Store (legado: `setConversations`).  
Ambos aplicam o retorno do link **antes** de qualquer refetch de lista.
