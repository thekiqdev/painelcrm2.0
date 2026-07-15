# SPRINT_2_CLOSEOUT — Phase 10E · Float Header / Meta Ownership

| Campo | Valor |
|---|---|
| **Sprint** | 2 |
| **Phase** | 10E |
| **Gate** | **CLOSED** |
| **Data** | 2026-07-15 |
| **Tipo** | Frontend Runtime Hardening |
| **Backend / SQL / Redis / Socket / Workers / Flags / ADR** | **Não alterados** |

---

## Veredito

Com Domain Store ON, o Floating **não** usa mais RQ `conversation-meta` + `findChatConversationById` para header/meta da janela, overlay mobile e dock minimizado. Lê a mesma Conversation da Store que a lista / Chat.

---

## O que foi feito

| Item | Detalhe |
|---|---|
| `useFloatingConversationMeta` | Store ON → `selectCurrentConversation`; OFF → RQ legado |
| `FloatingConversationWindow` | Meta via hook; CRM patch early-return Store; tags/instance patch Store-first |
| `MobileConversationOverlay` | Idem |
| `FloatingCompactProfile` | CRM patch só Store quando ON |
| `MinimizedChatDock` | Metas do Store quando ON (RQ desabilitado) |
| Teste | `store.phase10e.floating-meta.test.ts` |

### Critério de aceite

| Critério | Status |
|---|---|
| Float header ≡ Conversation Store (flag ON) | **Pass** |
| Sem HTTP meta no path crítico Store ON | **Pass** |
| Profile CRM GET permanece ephemeral (identity/detail) | **Pass** (não removido) |
| Store OFF intacto | **Pass** |

---

## Observações (não corrigidas)

1. **WS-patch / Provider ainda invalidam ou patcham RQ `conversation-meta`**  
   Com Store ON o query está `enabled: false` no header — writes RQ são residual/legado. Não removidos para não quebrar Store OFF e outros consumidores de cache. Limpeza = Phase 11.

2. **`useFloatingConversationIdentity` / `conversation-crm-profile` RQ**  
   Continua GET de detalhe CRM para avatar/merge — **explícito** como cache de projeção (Sprint 4 / 10H), não SoT da Conversation row.

3. **Conversa fora do inbox Store**  
   Se painel abrir `conversationId` ainda não presente na Store, header pode ficar vazio até upsert/inbox (antes o HTTP `findById` cobria). Mitigação futura: hydrate pontual na Store — **não feito** nesta sprint.

4. **`patchConversationKanbanTagsEverywhere` ainda toca RQ**  
   Complementa Store patch; RQ write é no-op visual Store ON. Observado.

5. **Sprint 3 (open/race) e CRM detail ownership**  
   Fora de escopo.

---

## Próximo

```
ok sprint 3
```

→ Phase 10G · Selection & Open Pipeline Hardening
