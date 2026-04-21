# Etapa 5 — Propostas: outbound, observabilidade e permissões finas

Entrega da camada **HTTP outbound** assinada, **retries**, **configuração por tenant**, **observabilidade no detalhe da proposta** e **permissões granulares** (`proposals_send`, `proposals_convert_invoice`, `proposals_manage_integrations`), sem alterar o núcleo das Etapas 1–4 (funil, KPI, itens, `proposal_id`, link público opaco, aceite/recusa, `post_accept_billing_mode`, `proposal_integration_events`).

## Migração

- Arquivo: `database/init/122_proposals_etapa5_outbound.sql`
- Ordem: após `121_proposals_etapa4_automation.sql` em `packages/backend/src/migrate.ts`.
- Conteúdo resumido:
  - `role_module_permissions.module_extras` e `custom_role_module_permissions.module_extras` (JSONB).
  - Seeds de `module_extras` para `proposals` por `app_role` (admin/manager/member/viewer).
  - `tenant_proposal_webhook_settings` (URL, eventos, secret cifrado, `enabled`).
  - `proposal_webhook_deliveries` (fila por `integration_event_id`, retries, log).

## 1. Webhooks / outbound

- Após cada `recordProposalIntegrationEvent` com chave elegível, `enqueueProposalWebhookDelivery` insere (idempotente) em `proposal_webhook_deliveries` se o tenant tem integração ativa e o evento está na lista.
- **Worker** no processo API: `processProposalWebhookDeliveriesBatch` a cada `PROPOSAL_WEBHOOK_POLL_MS` (default **60s**, mín. 20s), configurável por ambiente.
- **Não bloqueia** aceite, recusa nem faturamento: enqueue e HTTP rodam assincronamente; falhas só afetam a entrega externa.

### Payload JSON (corpo POST)

Campos principais: `event_id`, `event_key`, `tenant_id`, `proposal_id`, `occurred_at`, `payload` (cópia do evento interno).

### Cabeçalhos

| Cabeçalho | Descrição |
|-----------|-----------|
| `Content-Type` | `application/json` |
| `X-PainelCRM-Timestamp` | Unix segundos |
| `X-PainelCRM-Signature` | `v1=<hex>` |
| `X-PainelCRM-Event` | Ex.: `proposal.public_accepted` |

## 2. HMAC / verificação no receptor

- Algoritmo: **HMAC-SHA256**.
- Mensagem assinada: `` `${timestamp}.${rawBody}` `` (string UTF-8 do body **exatamente** como enviado).
- O receptor deve ler o body bruto, montar a mesma string com o timestamp do cabeçalho e comparar o HMAC com o secret compartilhado (comparação em tempo constante recomendada).

## 3. Secret e cifra em repouso

- Variável de ambiente do servidor: **`PROPOSAL_WEBHOOK_SECRET_KEY`** (mín. **16** caracteres) — deriva chave AES-256-GCM (`proposalWebhookSecretCrypto.ts`).
- O secret informado pelo usuário é guardado apenas como **`secret_ciphertext`** (base64). A UI **nunca** devolve o secret após salvo; apenas `has_secret`.
- Sem a chave de ambiente, **salvar** webhook retorna erro claro.

## 4. Retries e política

- **Máximo:** 5 tentativas por registro (`max_attempts`).
- **Backoff** após falha (minutos entre tentativas): **1, 5, 15, 60, 360**.
- Estados: `pending` → `success` ou `failed` (esgotado). Entre falhas permanece `pending` com `next_retry_at`.
- **Reprocessamento manual:** `POST /api/me/tenant/proposal-webhook-deliveries/:id/retry` — zera `attempts`, `pending` e `next_retry_at = now()` (requer `proposals_manage_integrations`).

## 5. Configuração por tenant

| API | Método | Permissão |
|-----|--------|-----------|
| `/api/me/tenant/proposal-webhook-settings` | GET | `proposals_manage_integrations` |
| `/api/me/tenant/proposal-webhook-settings` | PUT | idem |
| `/api/me/tenant/proposal-webhook-deliveries/:id/retry` | POST | idem |

- Eventos suportados: `proposal.public_accepted`, `proposal.public_rejected`, `proposal.invoiced`.
- URL obrigatória **HTTPS** quando `enabled = true`.
- UI: **Configurações → Integrações → Webhooks — Propostas** (`section=proposalWebhooks`).

## 6. Observabilidade no painel

- **Detalhe da proposta → Histórico:** bloco **Entrega de webhooks (outbound)** com status, tentativas, HTTP, erro, próximo retry, sucesso; link para configurações; botão **Reprocessar envio** (quem tem `proposals_manage_integrations`).
- **API:** `GET /api/proposals/:id/webhook-deliveries` (permissão `proposals.view`).

## 7. Permissões finas (backend + frontend)

| Ação | Significado | Padrão seed (member) |
|------|-------------|----------------------|
| `proposals_send` | Gerar/revogar link público | permitido se `can_edit` e extra ≠ false |
| `proposals_convert_invoice` | POST convert-to-invoice | idem |
| `proposals_manage_integrations` | Webhooks tenant | **false** (true admin/manager) |

- Motor: `permissionEngine.ts` + `module_extras` em `role_module_permissions` / perfis customizados.
- **Compatibilidade:** se a coluna `module_extras` ainda não existir (`42703`), o backend usa defaults por role ao montar o mapa (ver `modulePermissionsService` / `customRolesService`).
- Frontend: `ModulePermissionsContext` expõe `canProposalSendRecord`, `canProposalConvertRecord`, `canProposalManageIntegrations`; `ProposalDetails` e `ProposalWebhookSettingsSection` respeitam essas regras.

**Nota:** edição geral da proposta (PATCH) continua exigindo `edit` como antes; apenas link público, conversão em fatura e configuração de webhook usam as ações finas onde aplicável.

## 8. Chat / kanban / automações futuras

- **Fonte de verdade** continua sendo `proposal_integration_events` + opcionalmente `proposal_webhook_deliveries` para telemetria de saída.
- **Eventos estáveis:** `proposal.public_accepted`, `proposal.public_rejected`, `proposal.invoiced`.
- Consumo interno futuro: assinar a mesma tabela ou fila derivada; o payload do webhook espelha o evento para sistemas externos.
- Nenhuma dependência de fila genérica além da tabela de entregas e do intervalo no `index.ts`.

## Riscos remanescentes

1. **Deploy:** backend novo sem migração **122** — webhooks e `module_extras` indisponíveis ou com fallback limitado; tabelas ausentes retornam listas vazias onde tratado (`42P01`).
2. **Worker no mesmo processo da API:** em múltiplas réplicas, duas instâncias podem tentar a mesma entrega (risco baixo de volume); evolução: fila dedicada ou `FOR UPDATE SKIP LOCKED` em transação curta.
3. **`PROPOSAL_WEBHOOK_SECRET_KEY`:** rotação exige recifrar secrets (hoje um único key id; documentar operação manual ou script futuro).
4. **Timeout HTTP:** 12s por tentativa; endpoints lentos podem falhar e entrar em retry.
5. **Perfis customizados:** `setCustomRoleModulePermissions` **preserva** `module_extras` existentes; a UI de perfis ainda não edita extras — ajuste fino via SQL/migração futura.

## Checklist final

- [x] Proposta gera eventos externos utilizáveis (HMAC + payload coerente com `proposal_integration_events`).
- [x] Entrega outbound possui rastreabilidade (`proposal_webhook_deliveries`, `attempt_log`, painel).
- [x] Falhas têm retry automático + reprocessamento manual.
- [x] Tenant configura integração com secret não exposto na leitura.
- [x] Painel mostra estado operacional da integração no detalhe da proposta.
- [x] Ações sensíveis separadas por permissão (`send`, `convert`, `manage_integrations`) alinhadas frontend/backend.
- [x] Base pronta para integrações com chat/kanban (event keys estáveis + outbound opcional).

## Operação comercial robusta

O módulo fica **pronto para operação comercial robusta** no sentido de: entrega externa assinada, retries, visibilidade no CRM e segregação de permissões para link público, fatura e webhooks — **desde que** a migração **122** e a variável **`PROPOSAL_WEBHOOK_SECRET_KEY`** estejam aplicadas em produção e o endpoint do cliente valide HMAC corretamente.
