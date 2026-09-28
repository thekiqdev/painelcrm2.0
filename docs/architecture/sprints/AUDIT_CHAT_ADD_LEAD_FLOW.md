# AUDIT_CHAT_ADD_LEAD_FLOW — AUD-001 / AUD-002 / AUD-008

| Campo | Valor |
|---|---|
| **Data** | 2026-07-14 |
| **Tipo** | Investigation only |
| **Código alterado nesta auditoria** | Nenhum |

---

## AUD-001 — Cadeia completa `/chat`

```
UI: ChatContactProfileSheet.onAddLead / commercial menu
  → Chat.tsx handleAddLead()
      early: !selectedConversation → return
      early: !commercial.canCreateLeadFromChat → toast + return
  → apiClient.post('/api/leads', leadData)
  → chatService.linkConversation(id, { type:'lead', id })
       → POST /api/chat/conversations/{id}/link
       → retorna ChatConversation normalizado  ⚠ VALOR DESCARTADO
  → loadConversations(enabledInstanceIds)
       → loadInboxCommand({ surface:'chat', … })
       → GET /api/chat/conversations (agregado)
       → Store ON: applyStoreConversationListInternal (se applied)
       → Store OFF: setConversations(items)
       → fetchChatAttendanceCounts (side)
  → loadConversationProfile(selectedConversationId)
       → GET /api/chat/conversations/{id}/profile
       → setCurrentLead / setCurrentClient
  → toast.success
  → [React] useEffect CRM sync (deps leadId/client_id) pode correr DEPOIS
       → lê `conversations` LOCAL (não Store/view)
       → early-return se “unlinked” no local → limpa currentLead  ⚠
  → Render: chatContactProfileModel + sheet (kind / showLinkActions / currentLead)
```

### Arquivos / funções

| Arquivo | Função | Papel |
|---|---|---|
| `src/pages/Chat.tsx` | `handleAddLead` | Orquestra create+link+refresh |
| `src/pages/Chat.tsx` | `setConversations` | No-op se Store SoT |
| `src/pages/Chat.tsx` | `loadConversations` | Inbox reload |
| `src/pages/Chat.tsx` | `loadConversationProfile` | GET profile → `currentLead` |
| `src/pages/Chat.tsx` | CRM `useEffect` ~2873 | Sync profile; early wipe |
| `src/pages/Chat.tsx` | `chatContactProfileModel` | Modelo UI perfil |
| `src/components/chat/ChatContactProfileSheet.tsx` | `onAddLead` / flags `show*` | Render ações CRM |
| `src/services/chat.ts` | `linkConversation` / `getConversationProfile` | HTTP |
| `src/features/chat-core/core/loadInbox.ts` | `loadInboxCommand` | GET lista → Store |
| `src/features/chat-core/store/consolidation.ts` | `applyStoreConversationUpsert` / `UiUpdate` | **Não usados** neste fluxo |
| `src/features/chat-core/store/hooks/useChatSelection.ts` | seleção | `selectedConversation` Store |

### O que **não** acontece (gap)

- Não chama `applyStoreConversationUpsert(updated)`
- Não chama `applyStoreConversationsUiUpdate(...)`
- Não faz `setConversations` com resposta do link (e mesmo se fizesse, seria no-op com Store SoT)
- Não faz `queryClient.setQueryData` / invalidate floating (Float faz)
- Não invalida `['leads']`

---

## AUD-002 — Respostas HTTP vs uso

| Chamada | Retorno | Usado na UI? |
|---|---|---|
| `POST /api/leads` | `{ id, … }` | Só `id` para link |
| `POST …/link` | `ChatConversation` (leadId, etc.) | **IGNORADO** (`await` sem bind) |
| `GET …/conversations` via `loadInboxCommand` | lista | Store ON → write Store; Store OFF → `setConversations`; UI depende desse write |
| `GET …/profile` | `{ type:'lead', profile }` | `setCurrentLead` — pode ser **apagado** pelo effect seguinte |

Nenhuma resposta é “errada” no backend; o FE **descarta** o melhor patch (link) e pode **anular** o profile load.

---

## AUD-008 — Timeline e ponto de quebra

```
T0  Click "Adicionar Lead"
T1  POST /api/leads → 200 + id
T2  POST …/link → 200 + conversation com leadId   ← retorno descartado
T3  GET conversations (loadInbox)                 ← refresh lento / lista
T4a Store [ON]: lista escrita no Domain Store (se applied)
T4b Store [OFF]: setConversations(local)
T5  GET profile → setCurrentLead(profile)         ← UI parcialmente ok aqui
T6  useEffect CRM (selectedConversation.leadId mudou)
T7  conv = conversations.find(...)  // LOCAL stalo se Store SoT
T8  if (!client_id && !leadId) { clear currentLead; return }  ← QUEBRA
T9  Render: profileFields sem contact; ou leadId ainda null se T4 falhou
```

**Onde para a atualização visual esperada:** entre **T5→T8** (wipe do perfil) e/ou **T2** (falta de patch imediato na conversa selecionada), não nos endpoints.
