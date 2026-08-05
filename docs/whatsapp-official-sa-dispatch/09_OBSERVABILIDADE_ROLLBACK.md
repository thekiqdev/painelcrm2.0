# 09 — Observabilidade, correlação e rollback

**Pacote:** [whatsapp-official-sa-dispatch](./README.md)  
**Data:** 2026-08-03  
**Status:** a preencher (investigação)  
**Depende de:** [02](./02_CONTA_META_E_REMETENTE.md), [03](./03_BRIDGE_MOTOR_META.md), [07](./07_GATEWAY_ROUTING.md)  
**Bloqueia:** go-live seguro

---

## 1. Objetivo

Definir como **medir**, **correlacionar** e **reverter** o disparo oficial sem perda de auditoria, reaproveitando deliveries, webhooks e flags já existentes.

---

## 2. Achados baseline

### 2.1 Deliveries motores

| Domínio | Tabela | Uso |
|---------|--------|-----|
| Plataforma | `platform_notification_deliveries` | Status, event_key, channel, tentativas |
| Tenant | `notification_outbound_deliveries` (+ attempts/retry) | Idempotência outbound CRM |

Workers: `platformNotificationOutboundRetryWorker`, `notificationOutboundRetryWorker`.

### 2.2 Oficial Meta

| Peça | Uso |
|------|-----|
| Campaign recipients | Status por destinatário + attempts |
| Webhook | `whatsappOfficialWebhookService` — status `wamid` |
| Chat ingest | Conversas `provider=whatsapp_official` |
| Audit campanha | `whatsappOfficialCampaignAudit.ts` |
| Env rate limit | `whatsappOfficialCampaignEnv.ts` |

### 2.3 Ops

- Timeline no metadata do card (`superadminOpsLeadTimelineService.ts`)
- Metadata gateway: `acquisition_lead_id`, `ops_gateway_rollout`

### 2.4 Flags / kill switches

- Platform: `PLATFORM_NOTIFICATIONS_*` env + settings DB (`platform_notifications_enabled`, `_whatsapp_send_enabled`, …)
- Tenant NE: `NOTIFICATIONS_ENGINE_*` + `superadmin_settings`
- Sistema: `whatsapp_official_enabled`, `whatsapp_official_tenant_enabled`
- Gateway: `communication.gateway_v1`

Docs relacionados: `docs/billing/RUNBOOK_BILLING_WINDOW_AND_WHATSAPP.md`, auditorias outbound em `docs/architecture/billing/*NOTIFICATION*`.

---

## 3. Lacunas a fechar

1. Deliveries do motor **não** guardam `wamid` / provider Meta de forma padronizada (confirmar schema atual).
2. Status final (delivered/read/failed) do webhook oficial **não** atualiza automaticamente `platform_notification_deliveries` (confirmar).
3. Não há flag única tipo `platform_whatsapp_provider = meta | uazapi`.
4. Dashboards/ops UI misturam históricos (platform history tab vs campaign vs kanban timeline).
5. Classificador de erro UazAPI pode não mapear códigos Graph.

---

## 4. Perguntas a responder

1. Que colunas/JSON em deliveries guardar: `provider`, `provider_message_id`, `graph_error_code`?
2. Webhook status deve atualizar delivery por `wamid` (join) — desenho mínimo?
3. Métricas: contadores por event_key / provider / falha (logs estruturados suficientes na v1)?
4. Rollback: ordem de desligar Meta e reativar UazAPI sem dual-send.
5. Alertas: quem é notificado se quality rating cair ou token oficial expirar?
6. Retenção / PII em logs de payload Graph.

---

## 5. Flag de rollout proposta (rascunho)

```
platform_whatsapp_outbound_provider: 'uazapi' | 'meta_cloud' | 'meta_cloud_with_uazapi_fallback'
platform_whatsapp_official_event_keys: string[] // allowlist gradual
ops_kanban_whatsapp_provider: same enum or inherit
```

Investigar se vive em `superadmin_settings`, feature flags system, ou env.

### Ordem de rollback sugerida

1. Allowlist event_keys → vazio / provider → `uazapi`
2. Confirmar workers não enfileiram Meta
3. Validar UazAPI instance ainda designada e connected
4. Campanhas Meta (independentes) — pausar só se necessário
5. Postmortem com wamids / delivery ids

---

## 6. Correlação (IDs)

| Contexto | IDs a correlacionar |
|----------|---------------------|
| Platform billing | `delivery_id`, `event_key`, `target_tenant_id`, invoice/charge id, `wamid` |
| Password reset | `delivery_id`, user/phone, `wamid` |
| Ops Kanban | `acquisition_lead_id`, card id, column, `wamid`, gateway message id |
| Campanha | `campaign_id`, `recipient_id`, `wamid` |

---

## 7. Checklist de leitura

- [ ] Schema `platform_notification_deliveries` (migração 139+)
- [ ] `whatsappOfficialWebhookService.ts` + tracking migration 227
- [ ] Retry workers platform + tenant
- [ ] `whatsappDispatchErrorClassifier.ts`
- [ ] Settings globais platform-notifications controller
- [ ] Runbooks billing/WhatsApp existentes

---

## 8. Decisão (preencher)

| Campo | Valor |
|-------|-------|
| Campos novos em delivery | |
| Atualização via webhook | v1 / depois |
| Nome da flag de provider | |
| Runbook rollback (link) | |
| Data | |

**Próximo:** [10_TESTES_E_AMBIENTES.md](./10_TESTES_E_AMBIENTES.md)
