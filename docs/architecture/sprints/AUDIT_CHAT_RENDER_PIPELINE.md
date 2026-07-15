# AUDIT_CHAT_RENDER_PIPELINE — AUD-005 / AUD-006 / AUD-007

| Campo | Valor |
|---|---|
| **Data** | 2026-07-14 |
| **Investigation only** | Sim |

---

## AUD-005 — React Query no fluxo Add Lead (`/chat`)

| API | Em `handleAddLead`? |
|---|---|
| `invalidateQueries` | **Não** |
| `refetchQueries` | **Não** |
| `setQueryData` | **Não** |

Floating **sim**: invalidate CRM profile + listas CRM + leads; mais `setQueryData` via patch.

**Cache impede update no Chat principal?**  
Não é RQ a SoT da página Chat (Domain Store ou `useState`). O problema não é `staleTime` de uma query de conversa do `/chat`.  
Selector Store (`conversationUiFingerprint`) **inclui** `leadId` — não congela CRM linkage se o Store for atualizado.

---

## AUD-006 — Early returns relevantes

| Local | Condição | Efeito no bug |
|---|---|---|
| `handleAddLead` | `!selectedConversation` | aborta |
| `handleAddLead` | `!canCreateLeadFromChat` | aborta |
| `setConversations` | `isChatStoreSourceOfTruth()` | **descarta** qualquer merge legado |
| `setMessages` | idem | n/a CRM |
| CRM `useEffect` | `conv && !client_id && !leadId` com `conv` de **`conversations` local** | **limpa currentLead/Client e não chama profile** |
| `loadConversationProfile` | gen / selectedId mismatch | descarta resposta tardia |
| `loadInboxCommand` | `stale` / `!shouldWriteToStore` | `applied: false` → Store não muda |
| `loadInboxCommand` | join `inFlight` mesma key | pode reutilizar promise em voo (stale raro) |
| Floating `handleCreateLeadAndLink` | `isGroup \|\| !conversation` | aborta (float) |

---

## Pipeline de render (Chat principal)

```
selectedConversationId
  → useChatSelection / conversationsView.find
  → selectedConversation  (leadId?)
  → chatContactProfileModel(kind, profileFields from currentLead|currentClient)
  → ChatContactProfileSheet(
       showLinkActions = !client_id && !leadId,
       showConvertLead = leadId && !client_id,
       profileFields, …
     )
```

Sinais visuais de sucesso:

1. `showLinkActions` some / `showConvertLead` aparece → precisa **`selectedConversation.leadId`**.  
2. Campos CRM preenchíveis → precisa **`currentLead`**.  

O fluxo quebra (1) se não houver upsert/GET aplicado; quebra (2) se o effect wipear `currentLead`.

---

## AUD-007 — Floating vs `/chat`

| Aspecto | Floating | `/chat` |
|---|---|---|
| Create lead | `POST /api/leads` | igual |
| Link | `linkConversation` → **usa `updated`** | **descarta `updated`** |
| Patch imediato | `applyFloatingCrmPatch(updated)` / compact igual | ausente |
| Refresh lista | invalidate RQ floating | `loadConversations` full GET |
| Profile CRM | invalidate `conversation-crm-profile` | `loadConversationProfile` + effect frágil |
| SoT UI conversa | RQ meta (+ Store se ON para lista) | Store SoT **ou** local state |
| Provider | FloatingChatProvider + RQ | Chat page dual state |
| Por que Float funciona | Patch síncrono do retorno do link + invalidate profile | Depende de GET + path Store/local inconsistente |

**Diferença decisiva:** Floating aplica a conversa retornada pelo link **antes** de qualquer refetch; Chat principal **ignora** esse retorno e ainda mantém um effect que valida vínculo olhando o **estado local errado** quando Store é SoT.
