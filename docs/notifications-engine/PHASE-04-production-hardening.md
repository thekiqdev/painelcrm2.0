# Fase 4 — Hardening de produção (MVP transacional)

## 1. Objetivo da Fase 4

Endurecer o MVP transacional já ligado nas Fases 2–3: **retry básico**, **observabilidade mínima**, **logs úteis**, **métricas agregadas**, **rollout por flags e piloto por tenant**, **API operacional** (CRM + superadmin) e **digest opt-in** para `invoice.due_soon` / `invoice.overdue` — sem UI completa do tenant, sem e-mail/SMS e sem novos módulos.

## 2. Escopo exato da fase

- Alterações compatíveis com o modelo existente (`notification_outbound_deliveries`, `notification_outbound_delivery_attempts`).
- Workers no processo Node (mesmo padrão que Kanban / webhooks de proposta).
- Endpoints de leitura e agregações; sem alterar fluxos de negócio críticos.

## 3. O que entra nesta fase

1. Colunas de retry (`retry_count`, `next_retry_at`, `dispatch_sender_user_id`) + índices de consulta.
2. Classificação **transitório vs definitivo** de erros de envio WhatsApp e reagendamento com backoff exponencial simples.
3. Worker de polling `processNotificationOutboundRetriesBatch` (intervalo configurável).
4. Métricas agregadas por `status` / `canal` e latência média de envios `sent` (quando `sent_at` existe).
5. Rotas CRM: `GET /api/notifications-engine/deliveries/search`, `GET /api/notifications-engine/metrics/summary`.
6. Rotas superadmin: `GET /api/superadmin/notifications-engine/summary`, `GET /api/superadmin/notifications-engine/deliveries`.
7. Flags adicionais: verbose log, max tentativas, base de backoff, piloto por tenant, digest de faturas.
8. Digest **opt-in** `invoice.due_soon` / `invoice.overdue` com idempotência `event:invoiceId:YYYY-MM-DD` (UTC).

## 4. O que não entra nesta fase

- E-mail, SMS, campanhas, jornadas, in-app, notificações operacionais internas.
- UI completa do tenant (editor de templates, preferências visuais).
- Motor de filas dedicado (SQS, etc.) ou backoff distribuído complexo.
- Garantias multi-instância fortes sem `SKIP LOCKED` (aceite: polling simples).

## 5. Riscos operacionais herdados da Fase 3

- Dependência de `FRONTEND_URL` / `PUBLIC_APP_URL` para links em propostas/contratos.
- `contract.sent` só quando há token de convite materializado no bootstrap.
- Destinatário sem telefone → skip silencioso (agora também com logs estruturados opcionais).
- **Piloto por tenant:** se `NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_TENANT_IDS` estiver definido, tenants fora da lista **deixam de receber** eventos de negócio até alargar a lista.

## 6. Estratégia de hardening

- Persistir remetente WhatsApp na entrega para retries coerentes.
- Não bloquear o request HTTP do negócio: falhas e retries tratadas em worker + tentativas registadas.
- Manter idempotência global por `(tenant_id, idempotency_key)`.

## 7. Estratégia de retry

- Após falha **transitória** (rede, 5xx, 429, timeout, etc.), estado `queued` com `next_retry_at` futuro e `retry_count` incrementado.
- Tentativas registadas em `notification_outbound_delivery_attempts` com `failed_transient` ou `failed`.
- Máximo de tentativas de envio: `NOTIFICATIONS_ENGINE_WHATSAPP_MAX_SEND_ATTEMPTS` (default **4** = 1 inicial + 3 reprocessamentos).
- Backoff: `NOTIFICATIONS_ENGINE_RETRY_BASE_MS` × 2^(`attempt-1`), teto 600s.
- Falhas **definitivas** (ex.: sem instância, 401/403) não reagendam.

## 8. Estratégia de métricas e observabilidade

- Agregações SQL por `status`, `channel` numa janela de horas (tenant ou global superadmin).
- Latência: média de `sent_at - created_at` para linhas `sent`.
- Logs: `notificationEngineLog.ts` — `NOTIFICATIONS_ENGINE_VERBOSE_LOG` para eventos de diagnóstico; `neLogWarn` para retry/piloto/render falhado no orquestrador.

## 9. Estratégia de rollout por feature flag

| Variável | Papel |
|----------|--------|
| `NOTIFICATIONS_ENGINE_ENABLED` | Master |
| `NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_ENABLED` | Liga publicação desde negócio |
| `NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_KEYS` | Allowlist opcional de `event_key` |
| `NOTIFICATIONS_ENGINE_WHATSAPP_SEND_ENABLED` | Envio real vs `skipped` |
| `NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_TENANT_IDS` | **Piloto:** CSV de UUIDs; vazio = todos |
| `NOTIFICATIONS_ENGINE_INVOICE_DIGEST_ENABLED` | Digest `due_soon`/`overdue` (default **off**) |

## 10. Estratégia de tenant piloto

- `NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_TENANT_IDS` — se definido, apenas esses tenants passam `gateAndPublish` para eventos de negócio.
- Combinação segura típica: motor `true`, business `true`, piloto com 1–2 tenants, `WHATSAPP_SEND` gradual.

## 11. Estratégia de validação manual

1. Aplicar migração `131_notifications_engine_retry_and_ops.sql`.
2. `NOTIFICATIONS_ENGINE_ENABLED=true`, `BUSINESS_EVENTS` e piloto conforme ambiente.
3. Ligar WhatsApp num utilizador do tenant piloto.
4. Disparar `POST /api/notifications-engine/simulate` e um evento real (ex.: `invoice.paid` via pagamento teste).
5. Ver `GET /api/notifications-engine/metrics/summary` e `GET .../deliveries/search?status=failed`.
6. Superadmin: `GET /api/superadmin/notifications-engine/summary?hours=168`.
7. Forçar erro transitório (ex.: derrubar API UazAPI) e confirmar `next_retry_at` / tentativas múltiplas até teto.
8. Confirmar idempotência: repetir mesmo `invoice.paid` não duplica entrega.

## 12. Decisão sobre `invoice.due_soon` / `invoice.overdue`

- **Implementado** como digest **opt-in** (`NOTIFICATIONS_ENGINE_INVOICE_DIGEST_ENABLED=true`), no mesmo padrão de `setInterval` do servidor que já existe para Kanban/webhooks.
- **Idempotência por janela:** chave `invoice.due_soon:{id}:{YYYY-MM-DD}` e `invoice.overdue:{id}:{YYYY-MM-DD}` (dia UTC).
- **Risco residual:** digest corre no processo API; em múltiplas réplicas sem coordenação, o mesmo dia pode gerar tentativas duplicadas até ser bloqueado por idempotência na BD — aceitável para MVP; evolução futura: job único ou advisory lock.
- **Default:** digest **desligado** até decisão operacional explícita.

## 13. Checklist de implementação

- [x] Migração `131_notifications_engine_retry_and_ops.sql` + `migrate.ts`
- [x] Classificador de erros + testes Vitest
- [x] Orquestrador: retry transitório + `dispatch_sender_user_id`
- [x] Worker de retry + intervalo em `index.ts`
- [x] Repositório: agregações, listagens filtradas, operações de retry
- [x] Rotas CRM + superadmin
- [x] Piloto por tenant + logs verbose
- [x] Digest opt-in + intervalo em `index.ts`
- [x] `env.example` + documentação (este ficheiro, STATUS, README)

## 14. Checklist de validação

- [x] `npm run build` (backend)
- [x] `npm test` (Vitest)
- [ ] Validação manual completa (checklist secção 11) em ambiente com Postgres + UazAPI

## 15. Status da fase

| Item | Estado |
|------|--------|
| Documentação Fase 4 | Concluído |
| Implementação | Concluído |
| Validação manual em ambiente real | Pendente (operacional) |

**Estado global:** **Concluída** no código e na documentação do repositório; validação manual em produção/staging fica como passo operacional.

---

## 16. Pós-implementação

### Ficheiros criados/alterados

| Caminho | Nota |
|---------|------|
| `database/init/131_notifications_engine_retry_and_ops.sql` | Colunas retry + índices |
| `packages/backend/src/migrate.ts` | Entrada `131_...` |
| `packages/backend/src/config/notificationsEngineEnv.ts` | Flags Fase 4 |
| `packages/backend/src/services/notificationsEngine/whatsappDispatchErrorClassifier.ts` | Classificação de erros |
| `packages/backend/src/services/notificationsEngine/whatsappDispatchErrorClassifier.test.ts` | Testes |
| `packages/backend/src/services/notificationsEngine/notificationEngineLog.ts` | Logs estruturados |
| `packages/backend/src/services/notificationsEngine/notificationEngineRepository.ts` | Agregações, filtros, retry SQL |
| `packages/backend/src/services/notificationsEngine/notificationEngineOrchestrator.ts` | Retry + logs + remetente |
| `packages/backend/src/services/notificationsEngine/notificationOutboundRetryWorker.ts` | Worker de reenvio |
| `packages/backend/src/services/notificationsEngine/notificationInvoiceDigestWorker.ts` | Digest opt-in |
| `packages/backend/src/services/notificationsEngine/businessTransactionalNotifications.ts` | Piloto + digest publish |
| `packages/backend/src/controllers/notificationsEngineController.ts` | Métricas + search |
| `packages/backend/src/controllers/superadminNotificationsEngineController.ts` | **Novo** — visão global |
| `packages/backend/src/routes/notificationsEngineRoutes.ts` | Novas rotas |
| `packages/backend/src/routes/superadminRoutes.ts` | Rotas superadmin |
| `packages/backend/src/index.ts` | Intervalos retry + digest |
| `env.example` | Variáveis documentadas |
| `docs/notifications-engine/PHASE-04-production-hardening.md` | Este documento |
| `docs/notifications-engine/STATUS.md` | Estado do épico |
| `docs/notifications-engine/README.md` | Índice |
| `docs/notifications-engine/PHASE-03-first-events.md` | Referência cruzada digest |

### O que ficou pendente

- UI completa do tenant (Fase 5+).
- Coordenação forte multi-réplica no digest (locks / fila dedicada).
- Dashboards gráficos; por agora API + SQL.

### Riscos / pontos de atenção

- Piloto por tenant mal configurado pode bloquear tráfego de produção sem intenção.
- Classificador “transitório por defeito” para erros desconhecidos: mitigado pelo **teto** de tentativas.
- Migração **131** obrigatória antes de usar retry (INSERT com novas colunas).

### Validações realizadas no repo

- `npm run build` — OK  
- `npm test` — OK (63 testes)
