# Propostas — eventos do motor e diagnóstico rápido

## Regra do produto (MVP)

| Ação | `proposal.sent` | `proposal.accepted` |
|------|-------------------|---------------------|
| **POST** `/api/proposals` com `status: "sent"` | Sim — após gravar token de link público | — |
| **PATCH** quando `status` passa a `sent` | Sim | — |
| **PATCH** quando `status` passa a `accepted` (painel) | — | Sim |
| **POST** público aceitar (`/public/.../accept`) | — | Sim |

`proposal.rejected`: PATCH ou link público de recusa.

## Por que só faturas funcionavam e propostas não?

1. **Criação como enviada:** o formulário usa **POST com `sent`**, mas o hook do motor existia só no **PATCH** → **`proposal.sent` não era publicado na criação.** Corrigido em `createProposal`.

2. **Allowlist silenciosa:** se `NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_KEYS` lista só eventos de fatura (ex.: `invoice.created`), **`proposal.*` nunca passa em `gateAndPublish`** e não há erro visível. Agora regista **`business_event_key_allowlist_skip`** nos logs.

3. **Link público só na resposta HTTP, não no BD:** com **`PROPOSAL_WEBHOOK_SECRET_KEY` ausente ou com menos de 16 caracteres**, `saveProposalPublicLinkCiphertext` **não grava** `public_link_token_ciphertext`. O POST ainda devolve `public_link_path` (token emitido em memória), mas o job assíncrono do motor lia **só a coluna** → URL vazia → **`proposal.sent` era ignorado** antes do `gateAndPublish`. Corrigido passando a URL absoluta do **mesmo** `rawToken` no `createProposal` (`resolvedPublicProposalUrl`) e com **fallback** controlado (novo token + tentativa de gravar) quando o envio vem de **PATCH** rascunho → enviada sem ciphertext.

4. **Ordem e atomicidade produto:** `proposal.sent` passa a ser executado com **`await runProposalNotificationAfterStatusChangeNow`** só depois de existir **path + URL** válidos no create; se o link não puder ser emitido com `status: sent`, o backend devolve **422** (`PROPOSAL_SENT_REQUIRES_PUBLIC_LINK`), reverte a linha para **rascunho** e devolve `details.proposal` para o front abrir o rascunho.

5. **Imutabilidade cliente/lead:** o **PATCH** rejeita qualquer alteração de `client_id` ou `lead_id` após a criação (`409` com `PROPOSAL_CLIENT_IMMUTABLE` / `PROPOSAL_LEAD_IMMUTABLE`); o detalhe da proposta deixa de oferecer combobox de troca.

6. **Nome vazio no CRM vs fatura:** `loadRecipientForProposal` exigia `if (row?.name)` antes de olhar o telefone. **`invoice.created`** usa `client_name?.trim() || 'Cliente'`. Assim, **cliente ou lead com telefone válido mas sem nome** gerava **skip antes do gate** nas propostas, enquanto a fatura enviava. Corrigido com fallback **`Cliente` / `Lead`** e logs **`proposal_recipient_*`** / **`proposal_notify_row_not_found`** / **`proposal_notify_skip_no_recipient`**.

## Logs forenses (proposta)

- `proposal_notify_attempt` (`console.info`) — entrou no pipeline com `idempotency_key` e `actor_user_id`.
- `[notifications-engine] proposal_recipient_*` / `proposal_notify_row_not_found` / `proposal_notify_skip_no_recipient` (`neLogWarn`).
- Gate: `business_pilot_skip`, `business_event_key_allowlist_skip` (já existentes).
- Após gate: `… falhou` em `console.error` se `runTransactionalNotification` devolver `ok: false` (render, preferência, etc.).

## Checklist `env`

- `NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_KEYS` **vazio** = todos os eventos do catálogo; ou inclua explicitamente `proposal.sent`, `proposal.accepted`, `proposal.rejected`.
- `NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_TENANT_IDS` — se definido, o seu tenant UUID tem de estar na lista.

## Aceite público

`proposal.accepted` já era chamado em `postPublicProposalAccept`; falhas típicas: mesmo bloqueio de allowlist, sem telefone no cliente/lead, ou motor/remetente WhatsApp indisponível.

## BD sem `public_link_token_ciphertext`

Se a migration da coluna **não** foi aplicada (`42703`), o `GET` detalhe e o `saveProposalPublicLinkCiphertext` já eram tolerantes no controller; o motor **não** era — `loadProposalNotificationRow` quebrava o `await` do `proposal.sent`. Passou a repetir a query **sem** essa coluna (`NULL AS public_link_token_ciphertext`) e logar `proposal_notification_schema_no_public_link_ciphertext`. Aplique `database/init/123_proposals_public_link_token_ciphertext.sql` em produção quando possível.
