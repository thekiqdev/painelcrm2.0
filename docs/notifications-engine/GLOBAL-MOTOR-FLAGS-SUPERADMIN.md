# Toggles globais do motor — Super Admin (base de dados)

## Objetivo

Os três interruptores operacionais do Motor Central de Notificações deixam de depender do `.env` para o dia a dia e passam a ser **persistidos em `superadmin_settings`** e geridos em **Super Admin → Configurações → Motor de notificações** (`/superadmin/notifications-engine`).

## Chaves em `superadmin_settings`

| Chave | Significado |
|-------|-------------|
| `notifications_engine_enabled` | Motor ativo (API tenant, orquestrador, catálogo). |
| `notifications_engine_business_events_enabled` | Publicação automática desde propostas/contratos/faturas. |
| `notifications_engine_whatsapp_send_enabled` | Envio real ao gateway WhatsApp (UazAPI). |

Valores: texto `'true'` ou `'false'` (comportamento alinhado a `billing_auto_suspend_enabled`).

## Defaults

- Migração `database/init/132_superadmin_notifications_engine_global_flags.sql`: insere os três como **`true`** com `ON CONFLICT DO NOTHING`.
- Se a linha **não existir** (ambiente antigo antes da migração), o código assume **`true`** para não bloquear testes.

## Leitura no backend

- `packages/backend/src/services/notificationsEngine/notificationsEngineGlobalSettingsService.ts` — leitura/escrita SQL.
- `packages/backend/src/services/notificationsEngine/notificationsEngineRuntimeFlags.ts` — cache em memória.
- `packages/backend/src/config/notificationsEngineEnv.ts` — `isNotificationsEngineEnabled()`, `isNotificationsEngineBusinessEventsEnabled()`, `isNotificationsEngineWhatsAppSendEnabled()` combinam **cache (DB)** com **kill switch opcional via env**.

### Kill switch de emergência (env)

Se uma destas variáveis estiver definida explicitamente como `false`, `0` ou `no` (case-insensitive), o respetivo aspeto fica **OFF** independentemente do Super Admin:

- `NOTIFICATIONS_ENGINE_ENABLED`
- `NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_ENABLED`
- `NOTIFICATIONS_ENGINE_WHATSAPP_SEND_ENABLED`

**Não** definir o env (ou usar apenas comentários no `env.example`) = não força nada; prevalece o valor guardado na base.

Outras variáveis `NOTIFICATIONS_ENGINE_*` (piloto por tenant, lista de event_keys, retry, digest, verbose, etc.) **mantêm-se em env** nesta alteração.

## API Super Admin

- `GET /api/superadmin/notifications-engine/global-settings` — lê os três booleans (não exige motor ligado).
- `PUT /api/superadmin/notifications-engine/global-settings` — corpo JSON com qualquer subconjunto de `{ notifications_engine_enabled, notifications_engine_business_events_enabled, notifications_engine_whatsapp_send_enabled }`. Após gravar, o servidor chama `refreshNotificationsEngineFlagsFromPool` para atualizar o cache imediatamente.

## UI tenant

- `GET /api/notifications-engine/bootstrap` devolve `engine_enabled`, `business_events_enabled`, `whatsapp_send_enabled` (efeitos combinados com o motor master) e `default_locale`.
- Configurações → Notificações usa o bootstrap para mensagens globais e avisos secundários (negócio / WhatsApp).

## Ficheiros principais

- `database/init/132_superadmin_notifications_engine_global_flags.sql`
- `packages/backend/src/migrate.ts` (entrada da migração)
- `packages/backend/src/index.ts` (poll periódico do cache; opcional `NOTIFICATIONS_ENGINE_GLOBAL_FLAGS_POLL_MS`)
- `packages/backend/src/routes/superadminRoutes.ts`
- `packages/backend/src/controllers/superadminNotificationsEngineController.ts`
- `src/pages/superadmin/SuperAdminNotificationsEngineSettings.tsx`
- `src/layouts/SuperAdminLayout.tsx` (entrada de menu)
- `src/App.tsx` (rota)

## Como testar `invoice.created` e `invoice.paid`

1. Executar migrações (inclui `132_...`).
2. No Super Admin, abrir **Motor de notificações** e confirmar os **três** toggles **ligados**; guardar.
3. Garantir que **não** há kill switch nos três envs acima.
4. No tenant: motor ativo, WhatsApp configurado, preferências do evento ativas.
5. Criar/pagar fatura conforme fluxo já existente do CRM que publica `invoice.created` / `invoice.paid` (ver Fase 3 nos docs do motor).

Se o motor aparecer desligado na UI tenant, verificar primeiro o Super Admin e depois envs de kill switch.
