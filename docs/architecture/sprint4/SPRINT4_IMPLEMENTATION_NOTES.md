# Sprint 4 — Communication Gateway Bridge

## Escopo

Fundação enterprise de comunicação (`channelProviderGateway`) em **bridge/coexistência** — sem alterar envio legado (notificationsEngine, platformNotifications, chat UazAPI direto).

## Componentes

| Área | Caminho |
|------|---------|
| Migration M7 | `256_communication_messages_p0.sql` |
| Gateway | `packages/backend/src/communication/channelProviderGateway/` |
| Bridge adapter | `packages/backend/src/communication/adapters/uazapiBridgeAdapter.ts` |
| Webhooks | `packages/backend/src/communication/webhooks/` |
| Flags | `communication.gateway_v1`, `uazapi_bridge_v1`, `routing_v1`, `capability_registry_v1`, `webhook_normalizer_v1` |

## Gateway architecture

```
Caller (futuro)
  └─ channelProviderGateway.sendMessage / sendTemplate / sendTransactionalMessage
       ├─ [flag] communication.gateway_v1
       ├─ communicationRoutingService.resolve
       ├─ providerCapabilityRegistry.assert
       ├─ INSERT communication_messages (shadow ou real)
       ├─ [shadow] log only — sem adapter.send
       └─ [non-shadow + bridge] uazapiBridgeAdapter → whatsappChannelDispatcher (legado)
```

## Provider contracts

`ICommunicationProviderAdapter`: `sendMessage`, `sendTemplate`, `sendTransactionalMessage`, `healthCheck`, `supportsChannel`, `getCapabilities`, `normalizeWebhook` (opcional).

Registrados: `uazapi` (bridge), `smtp`/`meta_cloud`/`internal` (stubs P0).

## Capability model

Capabilities: `template_support`, `media_support`, `typing_support`, `read_receipt`, `reactions`, `session_window`, `official_api`, `transactional_allowed`, `marketing_allowed`.

UazAPI vs Meta: Meta tem `official_api` + `template_support`; UazAPI tem `session_window` + media sem official API.

## Message foundation

Tabela `communication_messages` — **não migra** mensagens chat/notify existentes. Campos: provider, channel, message_intent, correlation_id, idempotency_key, delivery_state, shadow_mode, routing_json.

Intents: `onboarding`, `recovery`, `billing`, `support`, `crm`, `marketing`, `ai`, `transactional`.

## Webhook normalization

`normalizeProviderWebhook` → eventos internos:

- `communication.message.received`
- `communication.message.sent`
- `communication.message.delivered`
- `communication.message.read`
- `communication.message.failed`

Foundation only — fluxos webhook atuais **não** foram trocados.

## Bridge coexistence

| Path | Sprint 4 |
|------|----------|
| notificationsEngine → uazapiService | **Inalterado** (default prod) |
| platformNotifications | **Inalterado** |
| Chat CRM | **Inalterado** |
| Gateway | Opt-in via flags; shadow default |

`uazapiBridgeAdapter` delega para `dispatchWhatsAppText` / `dispatchPlatformWhatsAppText` — mesmo código legado.

## Rollout

1. Deploy migration + código (flags OFF)
2. Staging: `communication.gateway_v1` ON (shadow) — validar logs `[COMMUNICATION]`
3. Internal: `webhook_normalizer_v1` shadow — comparar payloads
4. **Nunca** `communication.bridge_dual_dispatch` em prod P0

## Rollback

1. `communication.master_off` ON
2. Gateway no-op; 100% tráfego legado
3. Tabela `communication_messages` inerte

## Fora de escopo

Meta Cloud send real, failover automático, omnichannel UI, campaign engine, AI routing, filas distribuídas.

## Testes

`packages/backend/src/communication/communication.test.ts`
