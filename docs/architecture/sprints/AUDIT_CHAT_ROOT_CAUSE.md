# AUDIT_CHAT_ROOT_CAUSE — AUD-009 / AUD-010 / AUD-011

| Campo | Valor |
|---|---|
| **Data** | 2026-07-14 |
| **Investigation only** | Sim — nenhuma correção aplicada |

---

## AUD-009 — Causa raiz (objetiva)

**Causa raiz primária (classe: estado / render pipeline Chat, não backend):**

1. **`handleAddLead` descarta o `ChatConversation` retornado por `linkConversation`** e não chama `applyStoreConversationUpsert` / `applyStoreConversationsUiUpdate` — ao contrário do Floating (`applyFloatingCrmPatch`) e ao contrário do path de archive no próprio Chat.  
2. Com **Domain Store SoT**, `setConversations` é **no-op**; o único update de ligação fica dependente do GET lista.  
3. O `useEffect` de sync CRM (~2873–2902) decide “unlinked” com **`conversations` local** (nunca atualizado sob SoT), não com `selectedConversation` / `conversationsView`. Quando o Store recebe `leadId`, o effect **reentra e zera `currentLead`**, desfazendo o `loadConversationProfile` bem-sucedido.

Classificação:

| Camada | Culpa? |
|---|---|
| Backend / endpoints | Não (200 OK; dados válidos) |
| React Query cache Chat | Não (não é SoT deste fluxo) |
| Socket | Não |
| Domain Store API em si | Não — API de upsert existe e não é chamada |
| Chat page state dual + Add Lead handler | **Sim** |

Formulação curta:

> **A conversa selecionada / perfil CRM não são sincronizados a partir do POST link; sob Store SoT o merge legado é no-op e um effect CRM based on stale local state apaga o perfil carregado.**

---

## AUD-010 — Arquivos envolvidos

| Arquivo | Função | Responsabilidade | No bug |
|---|---|---|---|
| `src/pages/Chat.tsx` | `handleAddLead` | Create+link+refresh | **Primário** — ignora `updated`; sem upsert Store |
| `src/pages/Chat.tsx` | `setConversations` | Guard SoT | No-op impede merges legados |
| `src/pages/Chat.tsx` | CRM `useEffect` | Sync profile | **Primário** — early wipe com `conversations` local |
| `src/pages/Chat.tsx` | `loadConversationProfile` | GET profile | Secundário — resultado anulado pelo effect |
| `src/pages/Chat.tsx` | `loadConversations` | GET inbox | Secundário — refresh lento / indireto |
| `src/features/chat-core/store/consolidation.ts` | `applyStoreConversationUpsert` | Patch pontual | **Não chamado** (gap) |
| `src/features/chat-core/core/loadInbox.ts` | `loadInboxCommand` | Hidrata lista | Path indireto |
| `src/services/chat.ts` | `linkConversation` | HTTP | OK; retorno unused pelo caller |
| `src/features/floating-chat/FloatingConversationWindow.tsx` | `applyFloatingCrmPatch` | Patch RQ | Referência correta |
| `src/features/floating-chat/FloatingCompactProfile.tsx` | `handleCreateLeadAndLink` | Fluxo saudável | Contraste |

---

## AUD-011 — Correção mínima recomendada (**NÃO IMPLEMENTAR agora**)

Menor alteração definitiva (só Chat page / call site — **sem** mudar contratos Store/RQ/Socket/flags):

Em `handleAddLead`, após o link:

1. `const updated = await chatService.linkConversation(...)`  
2. Se Store SoT: `applyStoreConversationUpsert(updated)` **ou** `applyStoreConversationsUiUpdate(prev => prev.map(...))`  
3. Senão: `setConversations(prev => prev.map(...))`  
4. `await loadConversationProfile(updated.id)`  
5. Opcional: remover `loadConversations` deste path (já não necessário para UI imediata)  
6. **No effect CRM:** usar `selectedConversation` / `conversationsView` (não `conversations` local) para o teste unlinked — evita wipe sob SoT  

Espelhar o padrão Floating + o padrão já usado em **archive** (`applyStoreConversationsUiUpdate`).

Mesma correção de merge+upsert deve ser aplicada a `handleConfirmLink` / `handleCreateClientFromConversation` (mesmo no-op SoT).
