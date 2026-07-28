# AUDIT — Billing Pipeline Ownership & Runtime

| Campo | Valor |
|-------|-------|
| **Nome** | `AUDIT_BILLING_PIPELINE_OWNERSHIP_RUNTIME` |
| **Versão** | 1.0 |
| **Tipo** | `investigation_only` |
| **Prioridade** | CRÍTICA |
| **Escopo** | Billing SaaS Super Admin (legado + Billing 2.0 + Asaas) |
| **Data** | 2026-07-27 |
| **Modo** | READ ONLY — nenhum código, migration, rota, flag ou banco foi alterado por esta auditoria |
| **Fora de escopo** | CRM B2B2C (`customer_invoices`) exceto onde compartilha webhook/path de job |
| **Baseline** | Closeouts S0–S10 · `PRD_BILLING_2_SUPERADMIN` · `IMPLEMENTATION_PLAN_BILLING_2` |

**Objetivo:** confirmar se o Billing 2.0 reutiliza o pipeline legado de renovação/cobrança ou se criou pipelines paralelos.

---

## Veredito executivo

O **pipeline canônico de renovação SaaS permanece único**:  
`billing:scheduler` → `billing:worker` → `BillingRenewalEngine` → `executeSaasRenewal` → `createInvoice` + `gateway.createCharge` → Asaas → webhook `PAYMENT_*` → `applyPaymentEvent` → `activatePlanFromBilling`.

O Billing 2.0 **não substituiu** esse fluxo. Ele adicionou:

1. **Extension points** (Collection Policy) — no-op com `collection_policy_engine_enabled=OFF` (default).
2. **Camadas ops** (L2, dunning, audit, dashboard, flags) — scripts/API separados, gated.
3. **Branches opt-in** (cartão token / Pix Automático) **dentro** de `executeSaasRenewal` / actions da policy — flags destrutivas OFF.

**Conclusão:** evolução por envelopamento (wrap), não segundo motor de renovação.

---

# PARTE 1 — INVENTÁRIO DE PIPELINES

| Nome | Origem | Trigger | Owner / Controller | Service | Worker / Cron / CLI | Flag | Status |
|------|--------|---------|--------------------|---------|---------------------|------|--------|
| **Checkout compra plano** | Legado | UI `/planos` → `POST /api/plan-purchase` | `planPurchaseController` | `subscriptionService.subscribePlan` → `createInvoice` + `createCharge` | HTTP sync | — | **Ativo** |
| **Checkout fatura pública** | Legado (+ S9/S10 UI) | `/saas-pay/:token` | `publicSaasBillingController` | `prepareSaasCheckout…`, pay-with-card, start-pix-automatic | HTTP sync | `pix_automatic` / saved card | **Ativo** |
| **Renovação SaaS** | Legado (engine wrapper) | Cron externo | `runRecurringScheduler` / `runRecurringWorker` | `enqueueRenewalJobs` → `BillingRenewalEngine.execute` → `executeSaasRenewal` | `billing:scheduler` + `billing:worker` | — | **Ativo (canônico)** |
| **Renovação manual / recovery** | Legado + ops | API Super Admin / service | `billingManualRenewalService`, `billingRecoveryService` | Reusa worker path / scan | HTTP + `billing:ops-reconciliation` | — | **Ativo (auxiliar)** |
| **Subscription lifecycle** | Legado | Pagamento / admin / expire | `subscriptionService`, cancel/expire | `createSubscription`, `ensureSaasSubscriptionAfterPaidActivation`, `expireCancelledSubscriptions` | Worker scheduler (expire) + webhook | `past_due_writer_enabled` | **Ativo** |
| **Invoice (`tenant_billing`)** | Legado | Renewal / purchase / admin | `invoiceService.createInvoice` | Mesmo | Via callers | — | **Ativo (único create)** |
| **Payment / charge gateway** | Legado | Renewal / checkout / policy / L1 | `gateway.createCharge` → `asaasService` → `asaasClient.createPayment` | Gateway registry | Via callers | — | **Ativo (único createPayment SaaS)** |
| **Webhook PAYMENT_*** | Legado | Asaas POST | `asaasWebhookHandler` → `handleWebhook` → `applyPaymentEvent` | `webhookCore`, `paymentDomainService` | HTTP | — | **Ativo** |
| **Webhook PIX_AUTOMATIC_*** | Billing 2.0 S10 | Asaas POST | Mesmo handler, branch antes do payment path | `billingPixAutomaticService.handlePixAutomaticWebhookEvent` | HTTP | Auth state; policy se engine ON | **Ativo (só se eventos chegarem)** |
| **Collection Policy Engine** | Billing 2.0 | Extension point após eventos | `scheduleCollectionPolicyExtensionPoint` | `hook` → `interpret` → `execute` | Fire-and-forget no processo caller | `collection_policy_engine_enabled` **OFF** | **Experimental / gated (default morto em runtime)** |
| **Dunning** | Billing 2.0 S8 | CLI / Ops API | `billingDunningJobService` | Emite eventos → policy | `billing:dunning` | `dunning_enabled` **OFF** | **Experimental (dry-run default)** |
| **Reconciliação L1** | Legado | CLI / L2 se `reconciliation_auto` | `billingReconciliationService.runReconciliation` | Re-`createCharge` mesma idempotency | `billing:reconciliation` | `reconciliation_auto` (junto ao L2) | **Ativo (ops)** |
| **Reconciliação L2** | Billing 2.0 S8 | CLI / Ops API | `billingReconciliationL2Service` | `getPayment` + `applyPaymentEvent` | `billing:reconciliation-l2` | `reconciliation_l2_enabled` **OFF** | **Experimental (dry-run default)** |
| **Pix Manual (avulso)** | Legado | Renewal / prepare / policy `create_pix` | `createCharge` PIX | Asaas | Via callers | Policy `generate_pix_auto`; notify flags | **Ativo** |
| **Pix Automático** | Billing 2.0 S10 | Renewal branch / policy / `/saas-pay` | `billingPixAutomaticService` | Auth API + charge com `pixAutomaticAuthorizationId` | HTTP + renewal | `pix_automatic` **OFF** | **Experimental / gated** |
| **Cartão (manual)** | Legado | `/saas-pay` pay-with-card | `payTenantBillingWithCard` | Asaas pay | HTTP | — | **Ativo** |
| **Cartão (token auto)** | Billing 2.0 S9 | Renewal / policy `charge_card` | `billingCardTokenStore` + `payWithCreditCard` | Asaas | Renewal / engine | `card_auto_renew` **OFF** | **Experimental / gated** |
| **Suspend** | Billing 2.0 (+ trial legado) | Policy / trial expire | `execSuspend` / `expireTrialsPastDue` | `tenants.status` | Policy / `trial:expire` / poll | `auto_suspend` **OFF** | Policy **gated**; trial **ativo** |
| **Cancel** | Legado + B2 | Cancel user / policy / expire | `cancelSubscription` / `execCancel` | subscriptions | Scheduler expire + policy | `auto_cancel` **OFF** | Misto |
| **Reactivate** | Legado + B2 | Paid webhook / policy | `activatePlanFromBilling` / `execReactivate` | subscriptionService | Webhook | `auto_reactivate` **ON** (só se engine ON) | **Ativo via paid** |
| **Overdue sync** | Legado (+ hook B2) | Poll in-process API | `syncOverdueBillingStatuses` | `billingOverdueStatusService` | `index.ts` `BILLING_OVERDUE_SYNC_POLL_MS` (~5 min) | Notify ownership via engine flag | **Ativo** |
| **Dashboard Billing 2.0** | Billing 2.0 | UI Super Admin | Páginas `billing2/*` + ops | Read/config; MRR flag | HTTP | `dashboard_mrr_contracted` | **Ativo (read)** |
| **Audit** | Billing 2.0 | Writers | `writeBillingAuditEvent` | `billing_audit_events` | Inline | Tabela 298 | **Ativo** |
| **Assinatura nativa Asaas (SSOT)** | — | — | — | — | — | — | **Não implementado / fora de escopo** |

### Schedulers / workers (SaaS)

| Processo | Tipo | Papel |
|----------|------|-------|
| `npm run billing:scheduler` | CLI one-shot (cron externo) | Enfileira jobs em `billing_recurring_jobs` |
| `npm run billing:worker` | CLI one-shot (cron externo) | Claim + `BillingRenewalEngine` |
| API `index.ts` overdue poll | In-process | Marca overdue + hook policy |
| API trial expire (1h) | In-process | Suspende trials |
| `billing:reconciliation*` / `billing:dunning` | CLI ops | Não substituem renewal |
| Bull / Agenda / node-cron interno billing | — | **Ausente** |

---

# PARTE 2 — OWNERSHIP

| Responsabilidade | Owner atual (runtime default) | Owner Billing 2.0 (quando flag ON) | Duplicidade? | Observações |
|------------------|-------------------------------|-------------------------------------|--------------|-------------|
| Criação de subscription | `subscriptionService` / pós-pago | Não cria | **Não** | `ensureSaasSubscriptionAfterPaidActivation` |
| Renovação | `executeSaasRenewal` via worker | Hook `renewal.charge_created` apenas | **Não** | B2 não tem segundo enqueue SaaS |
| Geração de invoice | `invoiceService.createInvoice` | Não | **Não** | Idempotência: `subscription_id` + `period_start` |
| Geração de cobrança | `gateway.createCharge` → Asaas | Policy pode `create_pix` / `charge_card` / pix auto | **Condicional** | Mesma fatura; skip se `gateway_reference_id` (PIX) |
| Geração de PIX avulso | Renewal / prepare / `execCreatePix` | `create_pix` na policy | **Não (mesmo adapter)** | Skip se charge já existe |
| Instrução Pix Automático | Branch renewal se engine OFF + flag | `create_pix_automatic_instruction` | **Não (XOR por ownership)** | Flag `pix_automatic` OFF → nunca |
| Cobrança cartão token | Branch renewal se engine OFF + flag | `charge_card` | **Não (XOR)** | Flag `card_auto_renew` OFF → nunca |
| Processamento PAYMENT | `webhookCore` → `applyPaymentEvent` | Hook `payment.paid` | **Não** | B2 reage; não reprocessa payment sozinho |
| Processamento webhook HTTP | `asaasWebhookHandler` | Branch PIX_AUTOMATIC no mesmo endpoint | **Não** | Um endpoint, dois tipos de evento |
| Reconciliação | L1 legado + L2 gated | L2 / ops | **Camadas, não paralelo renewal** | L2 dry-run default |
| Collection policy | no-op (flag OFF) | Engine interpret+execute | **Não no default** | |
| Dunning | Inativo (flag OFF) | `runBillingDunningCycle` | **Não** | Emite eventos; não cria invoice |
| `activatePlanFromBilling` | Webhook paid / zero settle | `execReactivate` chama o mesmo | **Não** | Função única |
| Suspend tenant | Trial expire; policy gated | `execSuspend` | **Parcial** | Paths diferentes (trial vs overdue policy) |
| Cancel | Legado + policy gated | `execCancel` | **Parcial** | |
| `tenant.status` | `activatePlanFromBilling`, trial, suspend | Policy suspend/reactivate | **Não (mesma coluna)** | |
| `subscription.status` | Legado + past_due writer gated | past_due / cancel actions | **Não** | Writer OFF default |
| `invoice.status` | `applyPaymentEvent` / overdue sync | L2 applyPaymentEvent | **Mesmo writer** | |
| Notify WhatsApp / Email | `publishPlatformBillingChargeCreated` | `notify_*` se engine owns | **Mitigado** | `shouldCollectionPolicyOwnNotifications` |
| Auditoria | Parcial legado | `billing_audit_events` | **Não** | B2 adiciona trilha |

---

# PARTE 3 — DUPLICIDADE DE PIPELINES (SIM / NÃO)

| Pergunta | Resposta | Evidência |
|----------|----------|-----------|
| Mais de um pipeline de **renovação** SaaS? | **NÃO** | Único path: `enqueueRenewalJobs` → worker → `BillingRenewalEngine` → `executeSaasRenewal`. Manual/recovery reusam o mesmo. |
| Mais de um de **geração de invoice**? | **NÃO** (múltiplos *callers*, um *create*) | `createInvoice` em `invoiceService.ts`; callers: renewal, subscribePlan, admin. |
| Mais de um de **geração de cobrança**? | **NÃO** (múltiplos callers, um adapter) | Sempre `gateway.createCharge` → Asaas `createPayment`. Policy/L1/checkout/renewal são callers. |
| Mais de um de **PIX** avulso? | **NÃO** | Mesmo `createCharge(PIX)`. |
| Mais de um de **Pix Automático**? | **NÃO** | Um serviço `billingPixAutomaticService`; entrypoints: renewal, policy, `/saas-pay`. |
| Mais de um de **cartão**? | **NÃO** (manual ≠ auto token) | Manual: pay-with-card. Auto: token + flag. Mesmo gateway `payWithCreditCard`. |
| Mais de um de **webhook** HTTP? | **NÃO** | `/api/webhooks/asaas` e `/webhooks/asaas` → mesmo `asaasWebhookHandler`. |
| Mais de um de **reconciliação**? | **SIM** (camadas L1 / L2 / ops-recovery) | Responsabilidades distintas; não são dois renewals. |
| Mais de um de **dunning**? | **NÃO** | Um `billingDunningJobService` + overdue sync (status, não dunning completo). |
| Mais de um de **ativação**? | **NÃO** | `activatePlanFromBilling` é o writer canônico pós-pago. |
| Mais de um de **suspensão**? | **SIM** (trial expire vs policy overdue) | Motivos/contextos diferentes; mesma coluna `tenants.status`. |
| Mais de um **scheduler** renovação? | **NÃO** | Um `billing:scheduler`. Overdue/trial são polls separados. |
| Mais de um **cron** renovação? | **NÃO** (no código) | Cron é externo ao repo; um par scheduler/worker. |
| Mais de um **worker** renovação? | **NÃO** | Um `billing:worker` (várias instâncias possíveis em ops — risco operacional, não segundo código). |
| Mais de um **CLI** mesma responsabilidade? | **SIM** (parcial) | L1 `billing:reconciliation` vs L2; ops-recovery; cert scripts. Renovação: só scheduler+worker. |

---

# PARTE 4 — RUNTIME

### Quem realmente executa (produção típica, flags default)

| Pipeline | Executa? |
|----------|----------|
| Scheduler + worker renovação | **Sim** (se cron externo configurado) |
| Checkout /saas-pay /planos | **Sim** |
| Webhook PAYMENT_* | **Sim** |
| Overdue sync in-process | **Sim** |
| Collection Policy engine | **Não** (flag OFF → no-op) |
| Dunning apply | **Não** (flag OFF; dry-run sem `--apply`) |
| L2 apply | **Não** (flag OFF; dry-run) |
| L1 reconciliação | **Se** cron/ops chamar script |
| Card auto / Pix Automático | **Não** (flags OFF) |
| Auto suspend/cancel policy | **Não** (flags OFF) |
| Dashboard / flags / policy UI | **Sim** (read/config) |

### Protegidos por Feature Flag

`collection_policy_engine_enabled`, `dunning_enabled`, `reconciliation_l2_enabled`, `card_auto_renew`, `pix_automatic`, `auto_suspend`, `auto_cancel`, `past_due_writer_enabled`, `dashboard_mrr_contracted`, notifies do engine, `collection_policy_db_read`.

### Permanentemente ativos (sem flag B2)

Renovação worker, `createInvoice`/`createCharge`, webhook payment, `activatePlanFromBilling`, overdue poll, checkout.

### Pipeline / código morto ou quase

| Item | Status |
|------|--------|
| Stub `pix_automatic_deferred_sprint10` | **Removido** (S10) |
| Stub `charge_card` | **Removido** (S9) |
| Flag `pix_auto_generate` | **Catalogada mas não lida** no runtime (`isBilling2FlagEnabled` ausente) — “morta” operacionalmente |
| Engine com flag OFF | Código vivo, caminho **nunca executa actions** |
| Docs antigos mencionando stubs S9/S10 | Desatualizados (não código) |

### Concorrência / race / dupla execução

| Risco | Existe? | Mitigação / residual |
|-------|---------|----------------------|
| Dois workers no mesmo job | Possível se multi-instância | `FOR UPDATE SKIP LOCKED` no claim |
| Duas invoices mesmo ciclo | Mitigado | `findInvoiceBySubscriptionAndPeriod` → `COMPLETED_IDEMPOTENT_SAAS` |
| Duas cobranças gateway | Residual | Idempotency `saas_renew_{sub}_{period}`; L1 reusa key; **engine ON** pode tentar paths PIX+card+pix_auto na mesma fatura (PIX skip se ref existe; card pode criar CC se ref não for cartão) |
| Dois webhooks mesmo evento | Mitigado | `asaas_webhook_events` + `payment_events` idempotência |
| Dois jobs mesma assinatura | Mitigado | Job por ciclo / claim |
| Loop | Baixo | Policy não re-enfileira renewal; dunning emite eventos, não cria jobs de renovação |
| Dupla notificação | Mitigado se XOR | `shouldCollectionPolicyOwnNotifications`; risco se flag oscilar mid-flight ou bug futuro |
| Race L2 + webhook | Possível | Ambos chamam `applyPaymentEvent` (idempotente por status) |

---

# PARTE 5 — FLUXO DE RENOVAÇÃO (mapa completo)

```text
[Cron externo]
    │
    ▼
billing:scheduler  →  enqueueRenewalJobs()
    │                    (recurringBillingJobService)
    │                    + expireCancelledSubscriptions()
    ▼
billing_recurring_jobs (pending)
    │
    ▼
billing:worker  →  processNextBatch()
    │                 claim FOR UPDATE SKIP LOCKED
    ▼
BillingRenewalEngine.execute()
    │
    ├─ já existe invoice do período?
    │     └─ SIM → COMPLETED_IDEMPOTENT_SAAS (+ ensure notify)
    │
    └─ NÃO → executeSaasRenewal()
              │
              ├─ createInvoice (tenant_billing)          ← LEGADO
              ├─ zero-amount settle? (opcional)
              ├─ gateway.ensureCustomer + createCharge   ← LEGADO
              │     ├─ [flag pix_automatic ON + engine OFF]
              │     │     → instruction OU auth journey   ← B2 S10 (branch)
              │     ├─ [flag card_auto_renew ON + engine OFF]
              │     │     → CREDIT_CARD + payWithToken    ← B2 S9 (branch)
              │     └─ senão PIX/boleto/método default    ← LEGADO
              ├─ notify legado SE engine OFF              ← LEGADO
              └─ scheduleCollectionPolicyExtensionPoint
                    (renewal.charge_created)
                    │
                    └─ engine OFF → no-op                 ← B2 (envelope)
                       engine ON  → interpret/execute     ← B2

[Asaas]
    │
    ▼
POST /api/webhooks/asaas  (PAYMENT_*)
    │
    ▼
handleWebhook → applyPaymentEvent
    │
    ├─ invoice.status → paid
    ├─ activatePlanFromBilling → tenant.status=active
    ├─ subscription active / clear past_due (gated)
    └─ scheduleCollectionPolicyExtensionPoint(payment.paid)

[Dashboard / Assinaturas SA]
    └─ leitura de subscriptions + tenant_billing + audit
```

**Onde o Billing 2.0 entra:** hooks, branches flaggeadas, audit, ops L2/dunning, UI.  
**Onde o legado continua:** create invoice, create charge, webhook payment, ativação, scheduler/worker.

---

# PARTE 6 — FLUXO DE COBRANÇA

| Pergunta | Resposta |
|----------|----------|
| Quem cria a invoice? | `invoiceService.createInvoice` (callers: renewal, subscribePlan, admin) |
| Quem cria a cobrança? | `PaymentGateway.createCharge` (Asaas) |
| Quem chama o Asaas? | `asaasClient` via `asaasService` |
| Quem cria PIX? | `createCharge` com `paymentMethod: PIX` (+ QR fetch) |
| Quem cria Pix Automático? | `billingPixAutomaticService` (auth API + charge com auth id) |
| Quem cria cartão? | Checkout: pay-with-card; auto: `payWithCreditCard` + token |
| Quem decide o método? | Renewal: `resolveAutomaticInvoicePaymentMethod` + overrides flag; checkout: usuário |
| Quem altera payment/invoice status? | `applyPaymentEvent` (+ overdue sync) |
| Quem altera subscription status? | `subscriptionService` + past_due writer (gated) + cancel/expire |
| Quem altera tenant status? | `activatePlanFromBilling`, suspend policy, trial expire, admin |
| Existe um único fluxo? | **Um pipeline de renovação + vários entrypoints de cobrança avulsa** (checkout, policy, L1) sobre o **mesmo** adapter gateway |

---

# PARTE 7 — WEBHOOKS

| Endpoint | Owner | Handler | Efeito | Idempotência | Audit | Risco duplicidade |
|----------|-------|---------|--------|--------------|-------|-------------------|
| `POST /api/webhooks/asaas` | Gateway Asaas | `asaasWebhookHandler` | Ver abaixo | `asaas_webhook_events` (hash/event_id) + `payment_events` | Ops health / audit B2 em pix events | Baixo se IDs estáveis |
| `POST /webhooks/asaas` | Alias | Mesmo | Idem | Idem | Idem | Idem |

### Por família de evento

| Família | Processamento | Efeito |
|---------|---------------|--------|
| **PAYMENT_*** | `handleWebhook` → `applyPaymentEvent` | Status fatura; activate; notify paid; hook `payment.paid` |
| **PIX_AUTOMATIC_*** | `handlePixAutomaticWebhookEvent` | Status auth em `subscriptions`; events `authorization_lost` / `instruction_refused`; **não** liquida fatura sozinho |
| **SUBSCRIPTION_*** (Asaas nativa) | Não há handler de produto Billing 2.0 | Fora do modelo (PainelCRM = SSOT) |

Lookup conciliation (S10): se payment não acha `gateway_reference_id`, tenta `gateway_metadata.pix_automatic_conciliation_id`.

Reprocess: `POST /api/superadmin/billing/webhooks/:eventId/reprocess` (ops).

---

# PARTE 8 — FEATURE FLAGS × PIPELINES

| Pipeline | Classificação runtime (defaults) |
|----------|----------------------------------|
| Renovação scheduler/worker | **Sempre ativo** (legado) |
| Invoice + createCharge | **Sempre ativo** |
| Webhook PAYMENT | **Sempre ativo** |
| Checkout | **Sempre ativo** |
| Overdue sync | **Sempre ativo** |
| Collection Policy execute | **Ativo por FF** (OFF) → efetivamente **nunca executado** |
| Dunning apply | **Ativo por FF** (OFF) / dry-run |
| L2 apply | **Ativo por FF** (OFF) / dry-run |
| L1 | **Ops / legado** (script) |
| Card auto | **Novo + FF OFF** |
| Pix Automático | **Novo + FF OFF** |
| Auto suspend/cancel | **Novo + FF OFF** |
| Past due writer | **Novo + FF OFF** |
| Dashboard MRR contracted | **Novo + FF OFF** |
| Flag `pix_auto_generate` | **Nunca executado** (não consultada) |
| Assinatura nativa Asaas | **Não existe** |

---

# PARTE 9 — BILLING ENGINE (Collection Policy)

| Pergunta | Resposta |
|----------|----------|
| A Engine cria invoices? | **Não** |
| A Engine cria cobranças? | **Sim, só se ON** — actions sobre `billing_id` já existente (`create_pix`, `charge_card`, `create_pix_automatic_instruction`) |
| A Engine apenas interpreta eventos? | Interpreta **e** executa actions quando ON |
| A Engine substitui o Billing legado? | **Não** — complementa via extension point |
| Responsabilidade duplicada? | **Potencial** se engine ON sem disciplina de ownership: renewal já criou charge e policy tenta outra action. Mitigações: skip PIX se `gateway_reference_id`; XOR notify; card/pix_auto atrás de flags. **Com defaults OFF, sem duplicidade efetiva.** |

---

# PARTE 10 — PIX AUTOMÁTICO

| Papel | Owner |
|-------|-------|
| Cria autorização | `startPixAutomaticAuthorizationForBilling` (renewal / policy / `POST …/start-pix-automatic`) |
| Cria instrução | `createPixAutomaticInstructionForBilling` (janela 2–10 dias úteis + auth ACTIVE) |
| Recebe PAYMENT | Webhook legado `PAYMENT_*` → `applyPaymentEvent` |
| Recebe AUTHORIZATION | Branch `PIX_AUTOMATIC_*` → update status + events |
| Decide fallback | `interpretCollectionPolicy` em `pix_automatic.authorization_lost` / `instruction_refused` → `create_pix` se policy permitir |
| Chama `create_pix` | `execCreatePix` (policy) |
| Chama `create_pix_automatic_instruction` | `execCreatePixAutomaticInstruction` |

### PIX Manual + Pix Automático na mesma cobrança?

| Cenário | Possível? |
|---------|-----------|
| Flag OFF | **Não** — pix auto não roda |
| Renewal engine OFF + flag ON + auth journey | Cria auth/QR; **não** createCharge avulso se `pixAutoHandled` |
| Renewal engine OFF + flag ON + fora da janela | Cai no createCharge legado (PIX avulso) — **um** charge |
| Engine ON + policy com `generate_pix_auto` e `pix_automatic_enabled` | Pode emitir ambas actions; `execCreatePix` **skip** se já há `gateway_reference_id`; instrução pode criar charge com auth se janela OK — **risco residual** se order/actions gerarem dois gateway payments com refs diferentes |

---

# PARTE 11 — DIAGRAMA DO PIPELINE REAL

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         BILLING LEGADO (canônico)                        │
│                                                                          │
│  scheduler ──► jobs ──► worker ──► executeSaasRenewal                     │
│                              │         │                                 │
│                              │         ├─ createInvoice                  │
│                              │         ├─ gateway.createCharge ──► Asaas │
│                              │         └─ notify (se engine OFF)         │
│                              │                                           │
│  checkout /planos /saas-pay ─┴─ createInvoice?/prepare/pay-with-card     │
│                                                                          │
│  Asaas PAYMENT_* ──► webhookCore ──► applyPaymentEvent                   │
│                              │         ├─ invoice paid                   │
│                              │         └─ activatePlanFromBilling        │
│                              │                                           │
│  overdue poll ──► syncOverdueBillingStatuses                             │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ extension points (noop se flag OFF)
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      BILLING 2.0 (envelope / ops)                        │
│                                                                          │
│  Collection Policy Engine ◄── interpret ◄── events                       │
│         │                         ▲                                      │
│         └─ execute actions ───────┘                                      │
│            (create_pix / charge_card / pix_auto / notify /              │
│             suspend / cancel / reactivate / audit)                       │
│                                                                          │
│  Flags ──► ligam/desligam engine, dunning, L2, card, pix auto, …         │
│                                                                          │
│  Dunning CLI ──► events (grace/cancel) ──► policy                        │
│  Recon L1 ──► re-createCharge (idempotency)                              │
│  Recon L2 ──► getPayment ──► applyPaymentEvent (mesmo writer)            │
│                                                                          │
│  Pix Automático service ◄── renewal branch / policy /saas-pay            │
│         │                                                                 │
│         └─ PIX_AUTOMATIC_* webhooks (mesmo endpoint Asaas)               │
│                                                                          │
│  Dashboard / Assinaturas / Logs / Flags ──► read + config                │
│  Audit ──► billing_audit_events                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

# PARTE 12 — CONCLUSÃO (checklist obrigatório)

| # | Pergunta | Resposta | Evidência |
|---|----------|----------|-----------|
| 1 | Existe apenas um pipeline de renovação? | **✅ SIM** | `billing:scheduler` + `billing:worker` → `executeSaasRenewal` único |
| 2 | Existe apenas um pipeline de geração de invoice? | **✅ SIM** | Um `createInvoice`; N callers |
| 3 | Existe apenas um pipeline de cobrança? | **✅ SIM** | Um `gateway.createCharge` → Asaas; N callers |
| 4 | Existe apenas um pipeline de processamento financeiro (PAYMENT)? | **✅ SIM** | `handleWebhook` → `applyPaymentEvent` |
| 5 | O Billing 2.0 reutiliza o pipeline legado? | **✅ SIM** | Hooks + branches + ops sobre o mesmo motor |
| 6 | O Billing 2.0 criou algum pipeline paralelo de renovação? | **❌ NÃO** | Não há segundo enqueue/engine SaaS |
| 7 | Existe risco de dupla invoice? | **❌ NÃO** (mitigado) | Idempotência por período; residual só bug/ops manual forçando |
| 8 | Existe risco de dupla cobrança? | **✅ SIM** (residual, não default) | Engine ON + múltiplas actions; L1 vs crash; **defaults OFF reduzem a zero prático** |
| 9 | Existe risco de dupla renovação? | **❌ NÃO** (mitigado) | Jobs + skip locked + idempotent complete |
| 10 | Existe risco de dupla notificação? | **❌ NÃO** (mitigado) | XOR via `shouldCollectionPolicyOwnNotifications` |
| 11 | Existe risco de corrida (race)? | **✅ SIM** (operacional) | Multi-worker, L2∥webhook; writers idempotentes em grande parte |
| 12 | Existe código morto? | **✅ SIM** (parcial) | Flag `pix_auto_generate` sem reader; engine path inerte com flag OFF |
| 13 | Existe legado removível no futuro? | **✅ SIM** | Notify legado / branches card-pix no renewal poderiam consolidar na policy **após** engine estável ON |
| 14 | A arquitetura atual está consistente? | **✅ SIM** | Com defaults destrutivos OFF e um SSOT de renovação |
| 15 | B2 = evolução do pipeline existente ou segundo pipeline? | **✅ SIM (evolução)** | Envelope + ops + capabilities opt-in; **não** segundo pipeline de renovação |

---

## Síntese final

1. **Um cérebro de renovação:** `executeSaasRenewal`.  
2. **Um executor de gateway:** Asaas via `createCharge` / webhooks `PAYMENT_*`.  
3. **Billing 2.0 = camada de política, observabilidade e opt-ins** — não um segundo billing.  
4. **Risco de paralelismo real só aparece se flags destrutivas forem ligadas sem governança** (engine + pix_auto + card + dunning).  
5. Com o estado default atual (**engine OFF**, **dunning OFF**, **L2 OFF**, **pix_automatic OFF**, **card_auto_renew OFF**), o runtime é o **legado puro** com hooks no-op.

---

## Fontes principais (código)

- `packages/backend/src/scripts/runRecurringScheduler.ts` / `runRecurringWorker.ts`
- `packages/backend/src/services/recurringBillingJobService.ts`
- `packages/backend/src/services/billingRenewalEngine/executeSaasRenewal.ts`
- `packages/backend/src/services/collectionPolicy/hook.ts` / `interpret.ts` / `execute.ts`
- `packages/backend/src/modules/gateways/asaas/webhooks/asaasWebhook.ts`
- `packages/backend/src/modules/payments/webhook/webhookCore.ts` / `paymentDomainService.ts`
- `packages/backend/src/services/billing2/billingFeatureFlags.ts`
- `packages/backend/src/services/billing2/billingPixAutomaticService.ts`
- `packages/backend/src/services/billingDunningJobService.ts`
- `packages/backend/src/services/billingReconciliationService.ts` / `billingReconciliationL2Service.ts`
- `packages/backend/package.json` (`billing:*`)
- `packages/backend/src/index.ts` (webhooks + overdue poll)

---

*Fim do relatório — investigation only. Sem recomendações de implementação, sem correções propostas.*
