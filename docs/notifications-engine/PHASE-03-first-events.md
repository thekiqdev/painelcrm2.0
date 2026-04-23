# Fase 3 — Primeiros eventos reais (MVP transacional)

## 1. Objetivo da Fase 3

Ligar **eventos transacionais reais** dos módulos **propostas**, **contratos** e **faturas** ao núcleo do Motor Central de Notificações (Fase 2), com publicação **após persistência confirmada**, **idempotência**, **merge strict**, canal **WhatsApp** e **rollout protegido por feature flags** — sem UI completa do tenant e sem novos canais.

## 2. Escopo exato da fase

- Pontos de integração mínimos e de **baixo risco** nos serviços/controllers já existentes.
- Reutilização do orquestrador, repositório, renderer, dispatcher e tabelas da Fase 2.
- Documentação de eventos **não ligados** quando não existir gatilho seguro (ex.: lembretes agendados).

## 3. Módulos cobertos

| Módulo | Cobertura Fase 3 |
|--------|------------------|
| Propostas | Eventos com ponto de publicação claro após `UPDATE`/`COMMIT` |
| Contratos | Envio para assinatura (`PENDING_SIGNATURE`) e ativação (`ACTIVE`) |
| Faturas (`customer_invoices`) | Criação persistida e transição para `paid` |

## 4. Eventos alvo (catálogo Fase 2)

| event_key | Intenção |
|-----------|----------|
| `proposal.sent` | Proposta marcada como enviada |
| `proposal.accepted` | Proposta aceite (painel ou link público) |
| `proposal.rejected` | Proposta recusada (painel ou link público) |
| `contract.sent` | Contrato enviado para assinatura |
| `contract.signed` | Contrato totalmente assinado (ativo) |
| `invoice.created` | Fatura de cliente criada |
| `invoice.paid` | Fatura de cliente paga |
| `invoice.due_soon` | *Pendente — ver secção 14* |
| `invoice.overdue` | *Pendente — ver secção 14* |

## 5. O que entra nesta fase

1. Flag dedicada para ativar publicação a partir de negócio (`NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_ENABLED`).
2. Allowlist opcional por `event_key` via env (`NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_KEYS`).
3. Resolução de **remetente WhatsApp** quando não há utilizador CRM no contexto (ex.: webhook): primeiro utilizador do tenant com instância `connected`, com preferência por `ownerUserId` / utilizador do painel quando aplicável.
4. Publicação **fire-and-forget** (erros apenas em log; não falhar fluxo de negócio).
5. Contrato mínimo: `tenant_id`, `event_key`, `entity_type`, `entity_id`, `occurred_at`, `actor`, `idempotency_key` (via orquestrador + colunas de entrega).

## 6. O que não entra nesta fase

- E-mail, SMS, campanhas, jornadas, automações avançadas.
- UI completa do tenant (preferências/overrides continuam via BD/API Fase 2).
- Notificações operacionais / in-app.
- Novos módulos além de propostas, contratos e `customer_invoices`.
- **`invoice.due_soon`** e **`invoice.overdue`** sem worker/cron fiável no projeto atual.

## 7. Decisões reaproveitadas da Fase 2

- Templates sistema imutáveis; overrides por tenant; merge **strict**.
- Idempotência: `UNIQUE (tenant_id, idempotency_key)` em `notification_outbound_deliveries`.
- `NOTIFICATIONS_ENGINE_ENABLED` controla API + motor; `NOTIFICATIONS_ENGINE_WHATSAPP_SEND_ENABLED` controla envio real (entrega pode ficar `skipped`).

## 8. Estratégia de publicação (pós-persistência)

- **Propostas (painel):** após `UPDATE proposals` bem-sucedido e mudança real de `status` (`sent` / `accepted` / `rejected`); e após **`POST /api/proposals` (create)** quando a proposta já é criada com `status = sent` (fluxo «Enviar proposta» no formulário).
- **Propostas (público):** após `UPDATE` de aceite/recusa via link público (estado consolidado).
- **Contratos (envio):** após transição `DRAFT` → `PENDING_SIGNATURE` e `bootstrapSignatureInvitesForContract` — um envio WhatsApp por signatário com `whatsapp_phone` e convite novo (`token` no bootstrap); se **nenhum** signatário tiver WhatsApp, mantém-se **compatibilidade:** um envio para o telefone do **cliente CRM** com o primeiro link do bootstrap (quando existir token novo).
- **Contratos (assinado):** após `COMMIT` da transação em `submitPublicSignature` quando o contrato passa a `ACTIVE` (único ponto no código que faz `UPDATE contracts SET status` para ativação por assinatura).
- **Faturas:** `invoice.created` após persistência completa em `createManualCustomerInvoice`, `createCustomerInvoice` e `createChildCustomerInvoice`; `invoice.paid` em `updateCustomerInvoiceStatus` na transição **para** `paid` (webhook, pay público, cartão, etc.).

## 9. Estratégia de idempotência

| Evento | idempotency_key |
|--------|-----------------|
| `proposal.*` | `{eventKey}:{proposalId}` |
| `contract.sent` | `contract.sent:{contractId}` (fallback cliente) **ou** `contract.sent:{contractId}:{signerId}` (um por signatário com WhatsApp) |
| `contract.signed` | `contract.signed:{contractId}` |
| `invoice.created` | `invoice.created:{invoiceId}` |
| `invoice.paid` | `invoice.paid:{invoiceId}` |

## 10. Estratégia de rollout (feature flags)

| Variável | Função |
|----------|--------|
| `NOTIFICATIONS_ENGINE_ENABLED` | Master: se inativa, nenhuma publicação de negócio. |
| `NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_ENABLED` | Liga/desliga **apenas** as chamadas desde módulos de negócio. |
| `NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_KEYS` | Opcional: lista separada por vírgulas de `event_key` permitidos; vazio = todos (comportamento padrão). |
| `NOTIFICATIONS_ENGINE_WHATSAPP_SEND_ENABLED` | Envio real UazAPI; se `false`, registo `skipped` após render. |

**Preferência por tenant/evento:** `tenant_notification_preferences` (Fase 2) — `enabled = false` bloqueia o evento.

## 11. Checklist de implementação

- [x] `notificationsEngineEnv` — flags de negócio + allowlist
- [x] `runTransactionalNotification` — actor/metadata parametrizáveis (extrair do simulador)
- [x] `resolveWhatsAppSenderUserIdForTenant`
- [x] `businessTransactionalNotifications` — cargas de contexto + publicação assíncrona
- [x] Hooks: `proposalsController`, `publicProposalViewController`, `contractsController`, `contractSignatureInviteService`, `customerInvoiceService`
- [x] `env.example` + documentação pós-implementação (secção 14)

## 12. Checklist de validação

- [x] `npm run build` (backend)
- [x] `npm test` (backend)
- [ ] Teste manual com flags ligadas, BD migrada, instância WhatsApp e `FRONTEND_URL` (propostas/contratos com link absoluto)
- [ ] Confirmar idempotência em reprocessamento de webhook `paid`

## 13. Status da fase

| Item | Estado |
|------|--------|
| Documentação inicial Fase 3 | Concluído |
| Implementação | Concluído |
| Documentação pós-implementação (secção 14) | Concluído |

**Estado global:** **Concluída**, com **pendências explícitas** (eventos agendados e edge cases) listadas na secção 14 — não bloqueiam o merge do núcleo Fase 3.

---

## 14. Pós-implementação

### Eventos efetivamente ligados

| event_key | Onde |
|-----------|------|
| `proposal.sent` | `proposalsController.updateProposal` — quando `status` passa a `sent`; **`proposalsController.createProposal`** — quando a proposta é criada já com `status = sent` (após emitir/gravar token de link público). |
| `proposal.accepted` | Painel: `updateProposal`; público: `publicProposalViewController.postPublicProposalAccept` |
| `proposal.rejected` | Painel: `updateProposal`; público: `publicProposalViewController.postPublicProposalReject` |
| `contract.sent` | `contractsController.updateContract` — `DRAFT` → `PENDING_SIGNATURE`; `publishContractSentNotifications` consome o `signature_invite_bootstrap` (link por signatário + coluna `contract_signers.whatsapp_phone`; migrações `134`/`135`). |
| `contract.signed` | `contractSignatureInviteService.submitPublicSignature` — após `COMMIT`, se contrato passou a `ACTIVE` |
| `invoice.created` | `customerInvoiceService`: `createCustomerInvoice`, `createChildCustomerInvoice`, `createManualCustomerInvoice` |
| `invoice.paid` | `customerInvoiceService.updateCustomerInvoiceStatus` — transição para `paid` |

### Eventos pendentes e motivo

| event_key | Motivo |
|-----------|--------|
| `invoice.due_soon` | Implementado na **Fase 4** como digest **opt-in** (`NOTIFICATIONS_ENGINE_INVOICE_DIGEST_ENABLED`) com idempotência diária; ver [PHASE-04-production-hardening.md](./PHASE-04-production-hardening.md). |
| `invoice.overdue` | Idem — digest opt-in na Fase 4; desligado por defeito até rollout explícito. |

### Comportamento especial / limitações

- **`proposal.sent`:** exige link público reidratável (`PROPOSAL_WEBHOOK_SECRET_KEY` + ciphertext); caso contrário regista skip em log (merge `proposal.public_link` obrigatório no template).
- **`contract.sent`:** se todos os signatários devolverem apenas `already_active` no bootstrap (sem `raw_token` na resposta), **não** há link por signatário reemitível no arranque — só é possível notificar se existir fallback (telefone do cliente com primeiro link emitido em execuções anteriores não se aplica aqui); em geral **não** há `contract.sign_link` novo → skip, salvo extensões futuras.
- **Destinatário (contrato):** prioriza **WhatsApp do signatário** (`contract_signers.whatsapp_phone`, só dígitos); se ninguém tiver, usa o telefone do **cliente CRM** (comportamento anterior).
- **Destinatário (proposta/fatura):** exige telefone normalizável (≥10 dígitos) no cliente ou lead (propostas) ou cliente (fatura); senão skip em log.
- **Remetente WhatsApp:** sem instância `connected` no tenant, skip em log.

### Ficheiros criados/alterados

| Caminho | Nota |
|---------|------|
| `packages/backend/src/config/notificationsEngineEnv.ts` | `NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_*` |
| `packages/backend/src/services/notificationsEngine/notificationEngineOrchestrator.ts` | `runTransactionalNotification`; `simulateTransactionalNotification` reutiliza |
| `packages/backend/src/services/notificationsEngine/whatsappSenderResolve.ts` | **Novo** — remetente fallback no tenant |
| `packages/backend/src/services/notificationsEngine/businessTransactionalNotifications.ts` | **Novo** — gates + contexto + enqueue |
| `packages/backend/src/controllers/proposalsController.ts` | Hooks proposta (painel) |
| `packages/backend/src/controllers/publicProposalViewController.ts` | Hooks aceite/recusa públicos |
| `packages/backend/src/controllers/contractsController.ts` | Hook `contract.sent` |
| `packages/backend/src/services/contractSignatureInviteService.ts` | Hook `contract.signed` pós-`COMMIT` |
| `packages/backend/src/services/customerInvoiceService.ts` | `invoice.created` + `invoice.paid` |
| `env.example` | Documentação das novas variáveis |
| `docs/notifications-engine/PHASE-03-first-events.md` | Este ficheiro |
| `docs/notifications-engine/STATUS.md` | Estado do épico |
| `docs/notifications-engine/README.md` | Índice |

### Validações realizadas

- `npm run build` (`packages/backend`) — OK  
- `npm test` (Vitest) — OK (60 testes)

### Riscos / pontos de atenção

- **`FRONTEND_URL` / `PUBLIC_APP_URL`:** URLs absolutos em `proposal.sent` e `contract.sent` dependem destas variáveis; em dev mal configurado, o link pode ser relativo apenas no texto.
- **Carga assíncrona:** publicações são agendadas com `void`/Promise não aguardada; falhas de merge ou de envio não afetam a resposta HTTP do negócio.
- **Multi-instância:** mesma idempotência na BD evita duplicar entrega por reintentos; vários pods podem tentar inserir — comportamento esperado `ON CONFLICT DO NOTHING`.
