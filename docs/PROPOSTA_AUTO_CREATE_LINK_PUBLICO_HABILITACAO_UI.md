# Proposta criada automaticamente (Kanban) — link público e botões no detalhe

## Causa raiz (botões «Abrir proposta» / «Copiar link» apagados)

Dois fatores principais:

### 1) Regra de UI demasiado restritiva

Em `ProposalDetails.tsx`, os botões usavam:

```ts
canUsePublicLinkActions = Boolean(publicLinkMeta?.active && effectivePublicUrl);
```

Ou seja, era **obrigatório** que `getProposalPublicLinkMeta` devolvesse `active: true` **e** que existisse `effectivePublicUrl`.

- `publicLinkMeta.active` reflete existência de linha ativa em `proposal_public_view_tokens` (correto).
- `effectivePublicUrl` vem de `public_link_path` no GET da proposta (cifra decifrada), de `lastPublicUrl` ou de `sessionStorage`.

Quando o GET da proposta **não** traz `public_link_path` (ex.: coluna `public_link_token_ciphertext` ausente num fallback de migração, cifra não configurada, ou falha intermitente ao ler meta) mas o token público **existe**, `active` podia ser `true` e `effectivePublicUrl` `null` → botões **desabilitados**.

### 2) `catch` ao carregar meta apagava o URL

Se `getProposalPublicLinkMeta` falhasse (rede, 500), o `catch` fazia `setLastPublicUrl(null)`, **mesmo quando** `getProposalById` já tinha devolvido `public_link_path`. Isso anulava o URL válido e desabilitava os botões.

### 3) Create manual vs automático (sessão)

No create **manual**, `ProposalCreateForm` chama `setStoredProposalPublicUrl(created.id, …)` com o `public_link_path` da resposta **201** antes de navegar para o detalhe. Assim, o detalhe podia resolver o URL via sessão mesmo sem cifra no servidor.

No fluxo **Kanban**, a resposta de `patchCard` / `createCard` já incluía `kanban_auto_created_proposal.public_link_path`, mas o frontend **não** gravava na sessão — só mostrava toast. Ao abrir a proposta pela lista, `effectivePublicUrl` podia ficar vazio nos mesmos cenários em que o manual funcionava.

## Correções aplicadas

### Backend — `GET /api/proposals/:id/public-link`

O JSON passa a incluir **`path`** (caminho relativo `/proposal-view/...`) quando o CRM consegue decifrar `public_link_token_ciphertext`, alinhado ao GET `/api/proposals/:id`. Assim o detalhe pode reidratar o URL só com o endpoint de meta quando o GET principal omitir o campo.

### Frontend — `ProposalDetails.tsx`

- Usar `fromApi || fromMetaPath` para definir `lastPublicUrl` e `sessionStorage`.
- No `catch` da meta: **não** limpar o URL se `getProposalById` já trouxe `public_link_path`; fallback para sessão.
- **`canUsePublicLinkActions`**: `effectivePublicUrl && publicLinkMeta?.active !== false` — só bloqueia quando o link está **explicitamente revogado** (`active === false`), não quando a meta falhou (`null`).

### Frontend — Kanban

- `useChatKanbanBoardDnd.ts` e `ChatKanbanAddCardDialog.tsx`: ao receber `kanban_auto_created_proposal.public_link_path`, chamar `setStoredProposalPublicUrl` como no create manual.

## Fluxo final

1. Automação cria proposta e, após commit, o backend chama `issueNewPublicTokenForProposal` + `saveProposalPublicLinkCiphertext` (igual ao `createProposal` manual).
2. Resposta da API inclui `public_link_path` quando a emissão do token corre bem.
3. O cliente grava o URL na sessão ao mover/adicionar cartão.
4. No detalhe, GET proposta + GET meta preenchem URL por cifra, por `meta.path` ou por sessão; botões ativos se houver URL e o link não estiver revogado.

## Riscos remanescentes

- Sem `PROPOSAL_WEBHOOK_SECRET_KEY` válida, a cifra não é persistida: o token em `proposal_public_view_tokens` pode existir (`active: true`), mas **não** há como reconstruir o path no servidor. Nesse caso continuam a valer: URL na **resposta** do Kanban + **sessionStorage** na mesma sessão, ou reemitir link (fluxo já existente na aba Faturamento, se aplicável).
- Ambientes com migração parcial (coluna de cifra ausente) devem aplicar a migration correspondente para paridade com o create manual.

## Checklist

- [x] Proposta automática nasce com token público (já existia no backend; mantido).
- [x] `public-link` meta pode devolver `path` para reidratar a UI.
- [x] Botões «Abrir proposta» / «Copiar link» deixam de depender de `active && url` de forma que falhe com URL válido.
- [x] Kanban grava URL na sessão como o create manual.
- [x] Cliente e lead inalterados (mesma criação de proposta).
- [x] Revogação (`active: false`) continua a bloquear ações.
