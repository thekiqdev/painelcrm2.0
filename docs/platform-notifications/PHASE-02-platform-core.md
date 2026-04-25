# Fase 2 — Núcleo técnico do Motor de Notificações da Plataforma

**Status da fase:** concluída (núcleo técnico + API Super Admin mínima + worker de retry).

---

## 1. Objetivo

Implementar o **núcleo técnico** do Motor de Notificações da **Plataforma** (transacional, MVP WhatsApp), com **domínio de dados e rotas separados** do motor do **tenant**, reutilizando apenas **código** compartilhável (renderer strict, classificação de erro WhatsApp, dispatcher, padrão de attempts/retry).

---

## 2. Escopo exato desta fase

- Modelagem SQL, seeds de catálogo MVP e templates `pt-BR`.
- Repositório, orquestrador, flags globais em `superadmin_settings`, worker de retry.
- API Super Admin **mínima** (catálogo, entregas, settings, preview, simulação, overrides).
- **Sem** ligar eventos reais de negócio (conta criada, billing, etc.) — isso é **Fase 3**.
- **Sem** UI completa do Super Admin.
- **Sem** e-mail, SMS, anúncios, campanhas, builder.

---

## 3. O que entra

| Entrega | Descrição |
|--------|-----------|
| Tabelas `platform_notification_*` | Catálogo, templates sistema, overrides, deliveries, attempts |
| Catálogo MVP (5 `event_key`) | Ver secção “Catálogo inicial” |
| Templates seed | WhatsApp `pt-BR` por evento |
| Overrides | Super Admin via API; `updated_by` → `users.id` |
| Renderer | `strictMergeRenderer` + whitelist por evento (`merge_fields` no catálogo) |
| Dispatcher | `dispatchWhatsAppText` com **tenant remetente** + **user remetente** da plataforma (settings/env) |
| Entregas | Persistência só em `platform_notification_deliveries` / `_attempts` |
| Flags globais | Chaves `platform_notifications_*` em `superadmin_settings` + cache em memória + kill switches `PLATFORM_NOTIFICATIONS_*` |
| Worker | `processPlatformNotificationOutboundRetriesBatch` (intervalo configurável) |

---

## 4. O que não entra

- Publicação automática a partir de fluxos de conta/auth/billing/plano.
- E-mail, SMS, push, anúncios em massa.
- Segmentação, campanhas, jornadas.
- UI rica no painel (apenas API nesta fase).
- Reuso de `notification_event_catalog` / `notification_outbound_deliveries` do tenant.

---

## 5. Decisões técnicas fechadas

- **Canal MVP:** apenas WhatsApp.
- **Prefixo de eventos:** `platform.*` (não reutilizar chaves do tenant).
- **Dono dos modelos:** Super Admin; tenants **não** editam `platform_notification_*`.
- **Baseline de texto:** migração (`platform_notification_template_system`); edição operacional via **override**, não alterando o seed base.
- **Idempotência:** `UNIQUE (target_tenant_id, idempotency_key)` em entregas.
- **Piloto (opcional):** `platform_notifications_pilot_target_tenant_ids` (CSV de UUIDs em settings) — fora do piloto, simulação/envio é recusado no orquestrador.

---

## 6. Separação motor plataforma vs motor tenant

| Aspeto | Tenant | Plataforma |
|--------|--------|------------|
| Documentação | `docs/notifications-engine/` | `docs/platform-notifications/` |
| Catálogo | `notification_event_catalog` | `platform_notification_event_catalog` |
| Entregas | `notification_outbound_deliveries` | `platform_notification_deliveries` |
| API | `/api/notifications-engine/*`, rotas tenant | `/api/superadmin/platform-notifications/*` |
| Flags | `notifications_engine_*` | `platform_notifications_*` |

**Reuso de código:** permitido (`strictMergeRenderer`, `dispatchWhatsAppText`, `classifyWhatsAppDispatchError`, limites de retry alinhados ao tenant quando env específico omitido).

---

## 7. Modelagem prevista / implementada

- `platform_notification_event_catalog` — `event_key`, `merge_fields` (JSON array = whitelist strict), `default_channel`, etc.
- `platform_notification_template_system` — templates padrão por `(event_key, channel, locale)`.
- `platform_notification_template_overrides` — override por Super Admin; FK a `system_template_id`.
- `platform_notification_deliveries` — fila/histórico; `target_tenant_id` = tenant **destino** da mensagem.
- `platform_notification_delivery_attempts` — tentativas por `delivery_id`.

---

## 8. Serviços / camadas

| Camada | Ficheiros (principal) |
|--------|------------------------|
| Repositório | `packages/backend/src/services/platformNotifications/platformNotificationEngineRepository.ts` |
| Flags DB + upsert | `platformNotificationsGlobalSettingsService.ts` |
| Cache runtime | `platformNotificationsRuntimeFlags.ts` |
| Env / kill switch | `packages/backend/src/config/platformNotificationsEnv.ts` |
| Contexto remetente + piloto | `platformNotificationDispatchContext.ts` |
| Orquestrador | `platformNotificationEngineOrchestrator.ts` |
| Worker retry | `platformNotificationOutboundRetryWorker.ts` |
| Log | `platformNotificationLog.ts` |
| API Super Admin | `packages/backend/src/controllers/superadminPlatformNotificationsController.ts` |
| Rotas | `packages/backend/src/routes/superadminRoutes.ts` (prefixo `/platform-notifications/`) |

---

## 9. Feature flags / configuração global

**Operação normal:** `superadmin_settings` com chaves:

- `platform_notifications_enabled`
- `platform_notifications_whatsapp_send_enabled`
- `platform_notifications_verbose_log`
- `platform_notifications_pilot_target_tenant_ids` (CSV opcional)
- `platform_notifications_dispatch_tenant_id`
- `platform_notifications_dispatch_sender_user_id`

**Cache:** `refreshPlatformNotificationsFlagsFromPool` no arranque da API e após `PUT .../global-settings`.

**Emergência (env):** se `PLATFORM_NOTIFICATIONS_ENABLED` ou `PLATFORM_NOTIFICATIONS_WHATSAPP_SEND_ENABLED` forem explicitamente `false`/`0`/`no`, forçam OFF (ver `platformNotificationsEnv.ts`).

**Retry:** `PLATFORM_NOTIFICATIONS_WHATSAPP_MAX_SEND_ATTEMPTS`, `PLATFORM_NOTIFICATIONS_RETRY_BASE_MS`, `PLATFORM_NOTIFICATIONS_OUTBOUND_RETRY_POLL_MS`; fallback aos env `NOTIFICATIONS_ENGINE_*` quando omitidos.

Documentação de env: `env.example` (secção “Motor de Notificações da PLATAFORMA”).

---

## 10. Catálogo inicial (MVP)

Todos considerados **seguros como definição de contrato** nesta fase; a **emissão real** depende da Fase 3 (handlers de negócio + idempotência de negócio).

| `event_key` | Nota |
|-------------|------|
| `platform.account.created` | Merge fields alinhados a boas-vindas / login |
| `platform.auth.login_link.issued` | Link mágico + expiração |
| `platform.plan.activated` | Plano ativo |
| `platform.billing.charge.created` | Cobrança criada |
| `platform.billing.payment_confirmed` | Nome canónico com **underscore** (não `payment.confirmed`) |

---

## 11. Governança de merge fields

- **Namespaces:** `platform.*`, `tenant.*`, `plan.*`, `billing.*`, `auth.*` (whitelist **por evento** na coluna `merge_fields`).
- **Strict:** `renderStrictTemplates` — placeholder fora da whitelist → erro; chave ausente no contexto → erro; valores vazios permitidos se a chave existir no contexto.
- **Preview:** `POST /api/superadmin/platform-notifications/preview` — mesmo pipeline de render, sem gravar entrega.

---

## 12. Checklist de implementação

- [x] Migração `139_platform_notifications_engine_core.sql` + entrada em `migrate.ts`
- [x] Repositório + orquestrador + dispatcher WhatsApp + attempts
- [x] Flags globais (`superadmin_settings`) + `platformNotificationsEnv` + refresh no startup
- [x] Worker de retry + intervalo no `index.ts`
- [x] Rotas Super Admin `/api/superadmin/platform-notifications/*`
- [x] `env.example` atualizado

---

## 13. Checklist de validação

- [x] Documentação em `/docs/platform-notifications/`
- [x] Migração referenciada em `migrate.ts`
- [x] Tabelas do domínio plataforma criadas pela migração
- [x] Catálogo + templates seedados no SQL
- [x] Overrides modelados + API PUT/DELETE
- [x] Renderer strict + preview API
- [x] Deliveries/attempts no domínio correto
- [x] `npm run build` no backend sem erros
- [x] Motor do tenant não alterado (sem mudanças em `notification_*` / rotas tenant)

---

## 14. Ficheiros criados ou alterados (implementação)

**Novos**

- `packages/backend/src/services/platformNotifications/platformNotificationsGlobalSettingsService.ts`
- `packages/backend/src/services/platformNotifications/platformNotificationsRuntimeFlags.ts`
- `packages/backend/src/config/platformNotificationsEnv.ts`
- `packages/backend/src/services/platformNotifications/platformNotificationLog.ts`
- `packages/backend/src/services/platformNotifications/platformNotificationDispatchContext.ts`
- `packages/backend/src/services/platformNotifications/platformNotificationEngineOrchestrator.ts`
- `packages/backend/src/services/platformNotifications/platformNotificationOutboundRetryWorker.ts`
- `packages/backend/src/controllers/superadminPlatformNotificationsController.ts`

**Alterados**

- `database/init/139_platform_notifications_engine_core.sql` (se já existia no repo, mantido como migração canónica)
- `packages/backend/src/migrate.ts`
- `packages/backend/src/services/platformNotifications/platformNotificationEngineRepository.ts`
- `packages/backend/src/routes/superadminRoutes.ts`
- `packages/backend/src/index.ts`
- `env.example`
- `docs/platform-notifications/README.md`, `STATUS.md`, este `PHASE-02-platform-core.md`

---

## 15. Migrations

- `database/init/139_platform_notifications_engine_core.sql`

---

## 16. Pendências para a Fase 3

- Ligar **eventos reais** (conta criada, login link, plano, cobrança, pagamento) aos `event_key` com idempotência de negócio.
- Normalizar **telefone** e validação de destinatário por fluxo.
- Decisão de **piloto** em produção e monitorização (métricas/alerts).
- UI Super Admin (opcional) sobre estas APIs.
- Testes automatizados (orquestrador + strict render + idempotência).

---

## Secção de status (controle)

| Estado | Significado |
|--------|-------------|
| Pendente | Não iniciado |
| Em andamento | Implementação parcial |
| **Concluído** | **Fase 2 fechada para o núcleo + API mínima + worker** |

**Estado atual:** **Concluído.**
