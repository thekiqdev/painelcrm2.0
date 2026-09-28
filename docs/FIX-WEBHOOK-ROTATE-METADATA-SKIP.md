# Fix — Webhook Uaz: rotate / metadata / skip / last_seen

**Data:** 2026-07-17  
**Tipo:** correção de incidente (tempo real parado; UI mentia “OK”)

## Sintoma

- Mensagens WhatsApp só apareciam ao abrir conversa (`messages/sync`).
- Zero `webhook_v2_received` nos logs do Node.
- Repair/Reconfigure faziam skip (`already_configured`).
- “Último webhook recebido” atualizava ao **rotacionar secret** sem inbound real.
- Uaz e Painel podiam mostrar tokens diferentes no callback (metadata stale).

## Causas

1. `autoConfigureWebhook` saltava POST à Uaz se `metadata.webhook.url === resolvedUrl`.
2. `rotateInstanceWebhookSecret` atualizava coluna + `metadata.webhook_url`, mas **não** `metadata.webhook.url` (UI lia este).
3. Rotate e persist do auto-configure setavam `webhook_secret_last_seen_at = now()` sem delivery.
4. UI lia callback de `metadata.webhook` e não mascarava token no path v2.

## Correção

| Área | Mudança |
|------|---------|
| `autoConfigureWebhook` | Opt `force`; repair/reconfigure/force passam `{ force: true }` |
| Rotate | Grava `metadata.webhook` completo; **não** toca em `last_seen` |
| Auto-configure persist | Também deixa de setar `last_seen` |
| `getInstanceWebhook` | `callback_url` canónica (coluna), `provider_url`, `synced` |
| UI | Callback canónico + mask v2 + “Último **delivery**” + Sync com Uaz |
| Audit GET Uaz | Parse path `/v2/:id/:token` |

## QA pós-deploy

1. Abrir status da instância → Sync com Uaz e callback mascarado.
2. **Reparar webhook** → log `force_reconfigure` + `POST …/webhook` (não `skipped`).
3. Rotacionar secret → `last_seen` **não** deve saltar para “agora” só por isso.
4. Enviar 1 msg WhatsApp → log `webhook_v2_received` + `SaveMessage`.
5. Se (4) falhar com Sync=Sim: investigar delivery Uaz / WAF em POST.

## Nota

Secrets expostos em chats de suporte devem ser rotacionados após o deploy.
