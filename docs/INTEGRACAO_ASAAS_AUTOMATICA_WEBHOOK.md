# Integracao Asaas automatica (webhook)

## Objetivo

Automatizar o fluxo de conexao da integracao Asaas por tenant:

1. Usuario escolhe ambiente (`sandbox` ou `production`), informa API Key e clica em conectar.
2. Backend valida chave e testa conexao na API Asaas.
3. Backend cria webhook automaticamente (quando ainda nao existe).
4. Sistema persiste metadados do webhook e exibe status operacional na UI.

## Endpoints novos

- `POST /api/integrations/asaas/connect`
  - body: `{ environment, apiKey, webhookEmail? }`
  - valida ambiente/chave, testa conexao e provisiona webhook automaticamente.
- `POST /api/integrations/asaas/test`
  - body opcional: `{ environment?, apiKey? }`
  - testa conexao usando payload ou configuracao ja salva.
- `POST /api/integrations/asaas/recreate-webhook`
  - body opcional: `{ webhookEmail? }`
  - cria novo webhook e atualiza `webhook_id`/`webhook_auth_token`.
- `GET /api/integrations/asaas/status`
  - retorna estado consolidado de API + webhook + ultimos timestamps.

## Persistencia local

Foi adicionada a migration `173_asaas_webhook_auto_config_fields.sql` com campos em `payment_gateway_configs`:

- `webhook_id`
- `webhook_auth_token`
- `webhook_status` (`created|pending|error`)
- `webhook_url`
- `webhook_email`
- `webhook_events` (jsonb)
- `last_webhook_received_at`
- `last_webhook_error`

## Compatibilidade e fluxo legado

- O fluxo legado `PUT /api/me/tenant/payment-gateway` e `POST /api/me/tenant/payment-gateway/test` foi mantido.
- A UI continua salvando configuracao no endpoint legado e, para Asaas, chama automaticamente o novo `connect`.
- O webhook handler continua com idempotencia e pipeline atual de processamento de pagamentos.
- Validacao de token do webhook aceita tanto coluna nova (`webhook_auth_token`) quanto fallback legado em `credentials.webhook_auth_token`.

## Webhook Asaas

Payload de criacao segue o padrao:

- `name`: `PainelCRM - Pagamentos`
- `url`: `${PUBLIC_API_URL}/api/webhooks/asaas`
- `enabled`: `true`
- `interrupted`: `false`
- `authToken`: token forte gerado pelo sistema
- `sendType`: `SEQUENTIALLY`
- `events`: `PAYMENT_*` relevantes

## Erros tratados (mensagens amigaveis)

- API Key invalida/autenticacao.
- Chave aparentemente de ambiente incorreto.
- Falha de permissao em webhook.
- Limite de webhooks no Asaas.
- URL publica ausente.

