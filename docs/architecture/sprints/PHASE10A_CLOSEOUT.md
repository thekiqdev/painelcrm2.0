# PHASE10A_CLOSEOUT — Chat Runtime State Consistency

| Campo | Valor |
|---|---|
| **Phase** | 10A — Chat Runtime State Consistency |
| **Data** | 2026-07-14 |
| **Gate status** | **CLOSED** |
| **Tipo** | Hardening Final Pré-Produção (runtime Chat Page) |

---

## Resumo executivo

Chat Page CRM mutações aplicam imediatamente o retorno de `linkConversation` / unlink / archive via `applyStoreConversationUpsert` (Store SoT) ou `setConversations` (legado). Removida dependência de `loadConversations` para UI CRM. Effect CRM deixou de usar estado local stale — elimina wipe de `currentLead`/`currentClient`.

## Aceite

| Critério | Status |
|---|---|
| CRM não depende de `loadConversations` para UI | **Pass** |
| Retorno de `linkConversation` aplicado na Store/legado | **Pass** |
| useEffect CRM sem `conversations` local sob SoT | **Pass** |
| Sem wipe por estado stale | **Pass** |
| Lista / conversa / painel atualizam de imediato | **Pass** (code path) |
| Sem Backend/SQL/Socket/RQ defaults/Flags/ADR | **Pass** |
| Compatível Phases 5–9 | **Pass** |

## Entregáveis

- `SPRINT_PHASE10A_CHAT_RUNTIME_STATE_CONSISTENCY.md`
- `PHASE10A_RUNTIME_STATE_REPORT.md`
- `PHASE10A_QA_REPORT.md`
- `PHASE10A_CLOSEOUT.md` (este)

## Arquivos

- `src/pages/Chat.tsx`
- `src/features/chat-core/store/public.ts`

## Hotfix pós-QA (2026-07-14)

Sintoma: `store_update conversations` + selectors `skip-render` após Add Lead (+).  
Causa: `mapLegacyConversationToDomain` → `normalizeConversation` **não idempotente** — `leadId` lido só de `lead_id`, apagado no 2º pass; fingerprint igual → UI congelada.  
Fix: `normalizeConversation` aceita `lead_id | leadId`; domain mapper / `domainToUi` preservam CRM fields.

## Veredito

**PHASE 10A → CLOSED** (com hotfix de normalização CRM).
