# Fase 2 — Núcleo mínimo do motor (core engine)

## 1. Objetivo da Fase 2

Implementar no código e na base o **núcleo mínimo** do Motor Central de Notificações: modelagem, catálogos (eventos + templates sistema imutáveis via API), overrides por tenant, renderização **strict** de merge fields, **dispatcher base** por canal (WhatsApp), **log/histórico** de entregas e **feature flags** para rollout seguro — **sem** ligar ainda os módulos de negócio (propostas/contratos/faturas) a eventos reais.

## 2. Escopo exato da fase

- Infra de dados e seeds iniciais alinhados ao MVP transacional futuro (propostas, contratos, faturas).
- Serviços backend para resolver template (sistema + override), renderizar, enfileirar/registar entrega e despachar (ou saltar envio conforme flag).
- Endpoints autenticados para **inspeção** do catálogo e **simulação** de entrega (validação e teste operacional).
- Documentação desta fase e `STATUS.md` atualizados após implementação.

## 3. O que entra nesta fase

1. Modelagem mínima (tabelas novas + RLS onde aplicável).
2. Migration única registada em `packages/backend/src/migrate.ts`.
3. Catálogo inicial de `event_key` + `merge_fields` (JSON) para o MVP futuro.
4. Catálogo inicial de templates **sistema** (WhatsApp, `pt-BR`).
5. Estrutura de **override** editável por tenant (cópia; sistema nunca sobrescrito).
6. Renderer de merge fields em modo **strict** (placeholder inválido ou chave ausente no contexto = erro).
7. Dispatcher base por canal (implementação WhatsApp reutilizando UazAPI quando envio permitido por flag).
8. Log básico: entregas + tentativas.
9. Feature flags em variáveis de ambiente (ver secção 8).

## 4. O que NÃO entra nesta fase

- Disparo automático a partir de controllers/serviços de propostas, contratos ou faturas.
- UI completa do tenant (apenas API de suporte).
- E-mail ativo como canal de envio real.
- SMS, campanhas, jornadas, automações avançadas, janelas horárias, IA.
- Retry sofisticado / observabilidade completa (apenas base para evolução).

## 5. Decisões técnicas fechadas

| Decisão | Escolha |
|--------|---------|
| Natureza MVP futuro | Transacional externo apenas |
| Canal inicial | WhatsApp |
| E-mail | Fora da ativação inicial |
| Template sistema | Imutável para tenant; só via seed/migração administrativa |
| Customização tenant | Tabela de override; “restaurar padrão” = apagar override ou marcar inativo (Fase 3 UX) |
| Strict merge | Placeholder deve estar na whitelist do evento; valor obrigatório no contexto (string vazia permitida) |
| Idempotência | `UNIQUE (tenant_id, idempotency_key)` em entregas |
| Feature flag master | `NOTIFICATIONS_ENGINE_ENABLED` |
| Envio WhatsApp real | `NOTIFICATIONS_ENGINE_WHATSAPP_SEND_ENABLED` (sub-flag) |

## 6. Modelagem prevista

Ver migration `database/init/129_notifications_engine_core.sql`:

- `notification_event_catalog` — eventos globais, `merge_fields` JSONB (whitelist).
- `notification_template_system` — templates padrão por `event_key` + `channel` + `locale` (único).
- `tenant_notification_preferences` — `enabled`, canal efetivo opcional (default do evento).
- `tenant_notification_template_overrides` — override; FK ao template sistema (`system_template_id`).
- `notification_outbound_deliveries` — fila/histórico; status incl. `skipped` quando envio desligado.
- `notification_outbound_delivery_attempts` — tentativas.

## 7. Serviços / camadas previstas

- `config/notificationsEngineEnv.ts` — leitura das flags.
- `services/notificationsEngine/strictMergeRenderer.ts` — validação + render strict.
- `services/notificationsEngine/notificationEngineRepository.ts` — acesso a dados.
- `services/notificationsEngine/notificationEngineOrchestrator.ts` — resolver template, render, persistir entrega, chamar dispatcher.
- `services/notificationsEngine/whatsappChannelDispatcher.ts` — envio WhatsApp (UazAPI) ou noop.
- `controllers/notificationsEngineController.ts` + `routes/notificationsEngineRoutes.ts` — API: `GET /events`, `GET /deliveries`, `POST /simulate` (prefixo `/api/notifications-engine`), com `tenantAuthCrm`.

## 8. Feature flags previstas

| Variável | Efeito |
|----------|--------|
| `NOTIFICATIONS_ENGINE_ENABLED` | Se não `true`, rotas do motor respondem 503 e orquestrador não processa. |
| `NOTIFICATIONS_ENGINE_WHATSAPP_SEND_ENABLED` | Se não `true`, entrega fica `skipped` após render (útil para ambientes sem envio real). |

Documentar em `env.example`.

## 9. Checklist de implementação

- [x] Criar migration SQL + entrada em `migrate.ts`
- [x] Seeds: eventos + templates sistema (WhatsApp pt-BR)
- [x] RLS nas tabelas com `tenant_id`
- [x] Renderer strict + testes unitários
- [x] Orquestrador + dispatcher WhatsApp
- [x] Rotas: `GET /events`, `GET /deliveries`, `POST /simulate`
- [x] Atualizar `env.example`
- [x] Atualizar este doc (secção 13) e `STATUS.md`

## 10. Checklist de validação

- [x] `npm run build` no backend (TypeScript)
- [x] `npm test` no backend (vitest)
- [ ] Migration aplicável em base limpa (`npm run migrate` na raiz do monorepo, com Postgres configurado) — *executar no ambiente com BD*
- [ ] Com flag desligada: API retorna 503 — *teste manual ou e2e*
- [ ] Com flag ligada e send desligado: entrega `skipped` com corpo renderizado — *teste manual após migrate*
- [ ] Com flag ligada e send ligado: tentativa registada — *opcional; depende de instância UazAPI/WhatsApp*

## 11. Status da fase

| Item | Estado |
|------|--------|
| Documentação inicial Fase 2 | Concluído |
| Implementação código + SQL | Concluído |
| Documentação pós-implementação (secção 13) | Concluído |

---

## 13. Pós-implementação *(preenchido após o código)*

### Status final da Fase 2

**Concluída** (código e documentação no repositório). Validações manuais pós-migrate e envio real WhatsApp ficam para o ambiente com base e credenciais.

### Ficheiros criados/alterados

| Caminho | Nota |
|---------|------|
| `database/init/129_notifications_engine_core.sql` | Modelagem, RLS, triggers `updated_at`, seed eventos + templates sistema WhatsApp `pt-BR` |
| `packages/backend/src/migrate.ts` | Entrada `129_notifications_engine_core.sql` |
| `packages/backend/src/config/notificationsEngineEnv.ts` | `isNotificationsEngineEnabled()`, `isNotificationsEngineWhatsAppSendEnabled()` |
| `packages/backend/src/services/notificationsEngine/strictMergeRenderer.ts` | Merge strict + extração de placeholders |
| `packages/backend/src/services/notificationsEngine/strictMergeRenderer.test.ts` | Testes Vitest |
| `packages/backend/src/services/notificationsEngine/notificationEngineRepository.ts` | Catálogo, preferências, overrides, entregas, tentativas |
| `packages/backend/src/services/notificationsEngine/whatsappChannelDispatcher.ts` | Dispatcher WhatsApp via UazAPI (`senderUserId`) |
| `packages/backend/src/services/notificationsEngine/notificationEngineOrchestrator.ts` | `simulateTransactionalNotification`: resolve canal/template, render, idempotência, persistência, dispatch ou `skipped` |
| `packages/backend/src/controllers/notificationsEngineController.ts` | `GET /events`, `GET /deliveries`, `POST /simulate` |
| `packages/backend/src/routes/notificationsEngineRoutes.ts` | Rotas com `tenantAuthCrm` |
| `packages/backend/src/index.ts` | `app.use('/api/notifications-engine', ...)` |
| `env.example` | Documentação `NOTIFICATIONS_ENGINE_*` |

### Migrations

- `database/init/129_notifications_engine_core.sql` (registada em `migrate.ts`)

### Validações realizadas

- `cd packages/backend` → `npm run build` (tsc) — **OK**
- `cd packages/backend` → `npm test` (vitest, incl. `strictMergeRenderer.test.ts`) — **OK**, 60 testes
- `npm run migrate` na raiz — **não executado nesta máquina** (requer Postgres); SQL revisto e alinhado ao padrão `database/init/*.sql`

### Pendências para a Fase 3

- Wiring em propostas / contratos / faturas **após** `COMMIT` / persistência confirmada.
- UI tenant: listagem, toggle canal, editor de override, preview, histórico.
- Endpoints CRUD de preferências/overrides (se não expostos apenas pela UI).
- Política de retry, observabilidade e hardening de rollout (piloto, métricas).
