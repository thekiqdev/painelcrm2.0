# AUDIT_CHAT_STORE_UPDATE — AUD-003 / AUD-004

| Campo | Valor |
|---|---|
| **Data** | 2026-07-14 |
| **Investigation only** | Sim |

---

## AUD-003 — Após POST link, há patch na Store / estado?

### `/chat` — `handleAddLead`

| Operação | Existe? | Onde |
|---|---|---|
| `applyStoreConversationUpsert(updated)` | **Não** | — |
| `applyStoreConversationsUiUpdate(...)` | **Não** neste fluxo (existe para archive ~4533) | `consolidation.ts` |
| `setConversations(map updated)` | **Não** em Add Lead | (Create Client / Confirm Link **sim**, mas no-op Store SoT) |
| `dispatch(upsertConversation)` direto | **Não** | — |
| Write Store via `loadInboxCommand` | **Indireto** | só após GET lista completo |
| RQ `setQueryData` conversa | **Não** | — |

Comentário em `consolidation.ts` (ponte `applyStoreConversationsUiUpdate`):

> Evita no-ops silenciosos em vínculo CRM / archive / badge.

Ou seja, o projeto **já reconhece** que `setConversations` é no-op com Store SoT — mas **Add Lead não usa essa ponte**.

### Floating — contraste

| Operação | Floating |
|---|---|
| Após link | `applyFloatingCrmPatch(updated)` / `applyConversationCrmPatch(updated)` |
| Mecanismo | `queryClient.setQueryData` em meta + listas + minimized |
| Invalidate | `conversation-crm-profile` + CRM surfaces + `leads` |

---

## Gate `setConversations` (Chat.tsx ~372–375)

```ts
const setConversations = useCallback((action) => {
  if (isChatStoreSourceOfTruth()) return;  // early return silencioso
  setConversationsState(action);
}, []);
```

Qualquer merge legado de conversa (ex. `handleConfirmLink`, `handleCreateClientFromConversation`) **não atualiza Domain Store**.

---

## AUD-004 — Conversa selecionada após criar Lead

| Campo esperado | Store recebe? | React / seleção | Render |
|---|---|---|---|
| `leadId` | Só se `loadInboxCommand` applied com payload fresco | `useChatSelection` / `conversationsView` | `kind==='lead'`, `showLinkActions=false` se leadId chega |
| `lead_name` / CRM body | Via GET profile → `currentLead` | estado local | `profileFields` precisa `currentLead` |
| `client_id` | n/a (null) | — | — |
| `linked_at` / link_state | Se vier no GET/link | depende do write | badges |

### Store SoT ON — cenário do bug

1. Link OK; resposta **não** upsertada.  
2. GET lista pode atualizar Store → `selectedConversation.leadId` muda.  
3. `loadConversationProfile` seta `currentLead`.  
4. Effect CRM usa **`conversations` local** (congelado, nunca recebeu leadId) → trata como unlinked → **`setCurrentLead(null)`**.  
5. `chatContactProfileModel`: `kind` pode ir a `lead` (via Store), mas `contact = currentLead` fica **null** → profileFields “vazios”; se o usuário olha ações + formulário CRM, parece “nada mudou” ou lead incompleto.  
6. Se GET lista **não** aplicar leadId a tempo, `selectedConversation` permanece unlinked → botões Add Lead/Link **permanecem**; profile wipe agravado.

### Store OFF

Local `conversations` atualizado por `loadConversations` → effect tende a recarregar profile corretamente. Bug dominantemente ligado a **Store SoT + dual state**, mais **ausência de upsert do POST link**.

### Floating

Meta RQ patch imediato com `updated` do link → UI da conversa e flags CRM atualizam sem depender de GET lista nem do effect local `conversations`.
