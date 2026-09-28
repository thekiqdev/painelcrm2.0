# SPRINT F4.1 — Aggregated API Hotfix (UazAPI)

**Sprint:** `SPRINT_F4_1_AGGREGATED_API_HOTFIX_UAZAPI`  
**Data:** 2026-07-08  
**Status:** Concluída  
**Depende de:** F4a, F4b

---

## Objetivo

Corrigir a API agregada para tenants **100% UazAPI**, eliminando lista vazia com F4 ON, simplificando o contrato F4 sem alterar UX/UI e preparando extensão futura para WhatsApp Oficial.

---

## Problema (root cause)

Com F4 ON, o frontend enviava:

```
GET /api/chat/conversations?apiVersion=2&instanceIds=...&includeWhatsAppOfficial=1&inboxScope=tenant
```

No `queryBuilder.ts`, `includeWhatsAppOfficial=1` aplicava:

```sql
AND c.whatsapp_official_account_id IS NOT NULL
```

Isso restringia a inbox **somente** a conversas WhatsApp Oficial. Tenants UazAPI têm `instance_id` preenchido e `whatsapp_official_account_id` nulo → **lista vazia**.

O legado nunca fazia isso numa única chamada: iterava por instância UazAPI e, opcionalmente, uma segunda chamada só oficial.

---

## Correção

### 1. Predicado de canal (`channelPredicate.ts`)

Novo módulo centraliza o escopo de canal da API agregada:

| Entrada | Provider | SQL efetivo |
|---------|----------|-------------|
| `channelOrigin=all` ou `uazapi` | `uazapi` | `instance_id = ANY(...)` + `whatsapp_official_account_id IS NULL` |
| `channelOrigin=official` | `whatsapp_official` | `whatsapp_official_account_id IS NOT NULL` |

**`includeWhatsAppOfficial` é ignorado no SQL agregado** (parâmetro legado HTTP, mantido no parse para shadow/audit).

### 2. Contrato simplificado

- **`provider`**: campo interno/resposta (`meta.provider`), default `uazapi`.
- **`includeWhatsAppOfficial`**: `@deprecated` na API agregada; legado GET inalterado.
- Frontend (`chatConversationsRepository`) deixa de enviar `includeWhatsAppOfficial`; envia `channelOrigin: 'uazapi'` para inbox padrão.

### 3. Controller / access

Resposta vazia por falta de permissão oficial aplica-se apenas a `channelOrigin=official`, não mais a `includeWhatsAppOfficial=1`.

### 4. Escopo explícito F4.1

- **Suportado em produção:** UazAPI multi-instância via `instanceIds`.
- **Não implementado nesta sprint:** merge UazAPI + Oficial numa única chamada; WhatsApp Oficial agregado entra em sprint dedicada.

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `packages/backend/.../channelPredicate.ts` | **Novo** — resolve provider + SQL de canal |
| `packages/backend/.../queryBuilder.ts` | Substitui bloco `includeWhatsAppOfficial` |
| `packages/backend/.../request.ts` | Resolve `provider` no parse |
| `packages/backend/.../types.ts` | `ChatListProvider`, `provider` no request/meta |
| `packages/backend/.../listService.ts` | Access + `meta.provider` |
| `packages/backend/.../chatController.ts` | Empty response só para `channelOrigin=official` |
| `src/repositories/chatConversationsRepository.ts` | Não envia `includeWhatsAppOfficial` |
| `src/services/chat.ts` | Deprecia param; não serializa na URL |
| Testes backend + frontend | Casos F4.1 UazAPI |

---

## O que **não** mudou

- UX, telas, React Query, Chat Core, WebSocket, Domain Store.
- GET legado (`useAggregatedApi=false`) — mesma semântica e filtros.
- F4 OFF — comportamento idêntico ao anterior.
- Painel de feature flags.

---

## Testes

```bash
# Backend
npm test -- packages/backend/src/services/chatAggregatedConversations/chatAggregatedConversations.test.ts

# Frontend repository
npm test -- src/repositories/chatConversationsRepository.test.ts
```

Cobertura F4.1:

- `includeWhatsAppOfficial=1` + `instanceIds` → SQL UazAPI (não lista vazia).
- `channelOrigin=official` → filtro oficial preparado.
- Parse define `provider: 'uazapi'` por default.
- Repository não envia `includeWhatsAppOfficial`.

---

## Validação manual recomendada

1. Super Admin → Otimização do Chat → habilitar flag F4 de uma superfície (ex.: `CHAT_AGGREGATED_CHAT`).
2. Tenant só UazAPI: inbox deve mostrar **as mesmas conversas** que com F4 OFF.
3. Desabilitar flag: fallback legado sem regressão.

---

## Próximos passos (fora desta sprint)

- Sprint WhatsApp Oficial agregado: `channelOrigin=all` com merge server-side UazAPI + Oficial.
- Parâmetro HTTP `providers=uazapi,whatsapp_official` (opcional).
- Remover `includeWhatsAppOfficial` do contrato após período de depreciação.
