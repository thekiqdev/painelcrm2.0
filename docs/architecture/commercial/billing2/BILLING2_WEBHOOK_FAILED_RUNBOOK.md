# Runbook — Webhook Asaas failed (Billing 2.0 Sprint 7)

## Sintomas

- Dashboard / Webhooks mostra `failed` > 0
- Cobrança paga no Asaas permanece `pending`/`overdue` no PainelCRM
- `payment_gateway_configs.last_webhook_error` preenchido

## Diagnóstico (sem SSH)

1. Super Admin → Financeiro → **Webhooks**
2. Filtrar status `failed`
3. Abrir Logs (`billing_audit_events`) por `billing_id` / correlation se necessário
4. Conferir token: token inválido → **401** (não gera evento processado; erro em `last_webhook_error`)

## Reprocess seguro

Na UI Webhooks, botão **Reprocess** só aparece se:

- `asaas_webhook_events.status = failed`
- Existe `payment_events.payload` para o mesmo `event_id`

O que o reprocess faz:

1. Apaga a linha de idempotência em `payment_events`
2. Marca evento Asaas como `pending`
3. Reexecuta `handleWebhook('asaas', payload)`
4. Grava audit `webhook.reprocess`

**Não** reprocessa eventos `processed` (evita double apply acidental).

## Se não houver payload

Sem `payment_events.payload`, o reprocess UI fica desabilitado. Opções:

1. Pedir reenvio do webhook no painel Asaas (idempotência por `event_id`/`payload_hash`)
2. Usar reconciliação L2 (Sprint 8) via `getPayment` no gateway

## Segurança

- Endpoint de ingestão continua exigindo `asaas-access-token` válido
- Reprocess exige Super Admin autenticado (`requireSuperAdmin`)
