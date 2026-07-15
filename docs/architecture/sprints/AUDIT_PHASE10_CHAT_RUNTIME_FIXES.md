# AUDIT_PHASE10_CHAT_RUNTIME_FIXES

| Campo | Valor |
|---|---|
| **Tipo** | Investigation Only |
| **Sprint** | Phase 10 — Runtime Fixes (audit pré-implementação) |
| **Data** | 2026-07-14 |
| **Escopo** | Chat Runtime — Adicionar Lead em `/chat` |
| **Código alterado** | **Nenhum** |

---

## Problema reportado

Floating: Adicionar Lead atualiza UI.  
`/chat`: POST lead + POST link + GET conversations 200, **sem atualização visual**, sem erros de console.

---

## Veredito (critério de aceite)

| # | Pergunta | Resposta com evidência |
|---|---|---|
| 1 | Onde o fluxo para? | Após link OK: retorno ignorado; sync CRM effect (~2873) pode limpar `currentLead` usando `conversations` local stalo (Store SoT) |
| 2 | Por que o Lead não aparece imediatamente? | Sem patch imediato da conversa; perfil depende de GET + estado dual inconsistente |
| 3 | Store / React / Query / cache / render? | **Render/state dual na página Chat** (+ gap de não upsert Store). Não é falha de endpoint nem RQ SoT do `/chat` |
| 4 | Arquivo da causa raiz? | **`src/pages/Chat.tsx`** (`handleAddLead` + CRM `useEffect`; gate `setConversations`) |
| 5 | Correção mínima? | Upsert/`applyStoreConversationUpsert(updated)` + profile; corrigir effect para ler view/seleção — ver `AUDIT_CHAT_ROOT_CAUSE.md` |
| 6 | Alterações nesta auditoria? | **Nenhuma** (apenas docs sob `docs/architecture/sprints/`) |

---

## Documentos

| Doc | AUD |
|---|---|
| `AUDIT_CHAT_ADD_LEAD_FLOW.md` | 001, 002, 008 |
| `AUDIT_CHAT_STORE_UPDATE.md` | 003, 004 |
| `AUDIT_CHAT_RENDER_PIPELINE.md` | 005, 006, 007 |
| `AUDIT_CHAT_ROOT_CAUSE.md` | 009, 010, 011 |

---

## Resumo causal (1 parágrafo)

No Floating, o retorno de `linkConversation` é aplicado na hora via `setQueryData`. No Chat, `handleAddLead` descarta esse retorno, tenta refrescar via `loadConversations`/`loadConversationProfile`, e com Domain Store como SoT o `setConversations` legado é no-op; o effect que sincroniza CRM ainda consulta o array local antigo e **reverte** `currentLead` quando a Store finalmente muda — resultado: HTTP verde, UI sem lead visível.

---

## Próximo passo (fora desta auditoria)

Sprint de implementação **somente** nos call sites de Chat page (sem alterar ADR/Store contracts/Socket/RQ defaults/flags), alinhando Add Lead (e ideally link/client create) ao padrão Floating + `applyStoreConversationUpsert`.

---

## Status auditoria

**CLOSED** — investigation complete; implementation deferred.
