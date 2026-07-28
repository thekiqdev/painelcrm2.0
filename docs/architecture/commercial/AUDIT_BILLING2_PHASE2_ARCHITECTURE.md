# AUDIT — BILLING 2.0 (FASE 2) — ARQUITETURA, MIGRAÇÃO E GOVERNANÇA

| Campo | Valor |
|-------|-------|
| **Nome** | `AUDIT_BILLING2_PHASE2_ARCHITECTURE` |
| **Versão** | 1.0 |
| **Tipo** | `investigation_only` |
| **Prioridade** | critical |
| **Escopo** | Super Admin SaaS (PainelCRM → clientes da plataforma) |
| **Data** | 2026-07-23 |
| **Modo** | READ ONLY — nenhum código, migration, rota ou config foi alterado |
| **Pré-requisito** | [`AUDIT_SUPERADMIN_BILLING_ASAAS.md`](./AUDIT_SUPERADMIN_BILLING_ASAAS.md) (Fase 1) |

**Fora de escopo:** CRM B2B2C (`customer_invoices`, Billing Execution V2).  
**Objetivo:** validar arquitetura operacional (migração, estados, governança, monitoramento, escalabilidade) **antes** da implantação do Billing 2.0.

---

## Resumo executivo

A estratégia proposta (**flag “PIX Recorrente” OFF = fluxo atual; ON = Pix Automático Asaas**) é **tecnicamente viável** e é a forma mais segura de migrar: feature flag por tenant/global, opt-in com autorização do pagador, sem big-bang.

Pontos críticos descobertos nesta fase:

1. **Pix Automático exige consentimento do cliente** (Jornada 3 Asaas) — **não** há migração silenciosa automática dos clientes atuais.
2. Autorização **pode** ser obtida na próxima renovação (QR composto: 1ª cobrança + consentimento).
3. `grace_period_days` / `auto_suspend_enabled` existem em settings mas **quase não governam dunning** hoje — semente do motor configurável.
4. `subscriptions.past_due` existe no schema e **não é escrito** no SaaS — estado morto a ativar ou remover conceitualmente.
5. Multi-gateway SaaS está **parcialmente** preparado (`PaymentGateway`), mas registry só tem Asaas e há acoplamentos (`tenants.asaas_customer_id`, rotas webhook Asaas).
6. Reconciliação SaaS cobre “fatura sem `gateway_reference_id`”; **não** cobre “pago no Asaas / não pago no sistema” (falta poll `getPayment`).

**Recomendação final:** implantar Billing 2.0 como **camada de policy + adapters** sobre o motor atual (Modelo B da Fase 1), com feature flags, tabela de política (não workflow genérico na v1), e reconciliação financeira expandida como P0 de governança.

---

# 1. Estratégia de Migração

## 1.1 Proposta avaliada

```text
Hoje:
  Renovação → Nova cobrança PIX → Cliente paga → Webhook → Billing

Billing 2.0:
  Renovação
    ├─ PIX Recorrente OFF → fluxo atual (createCharge PIX avulso)
    └─ PIX Recorrente ON  → Pix Automático Asaas → Webhooks → Atualizar Billing
```

## 1.2 Viabilidade técnica

| Pergunta | Resposta |
|----------|----------|
| Estratégia é tecnicamente viável? | **Sim.** Encaixa no `executeSaasRenewal` + `resolveAutomaticInvoicePaymentMethod` / policy futura: branch por flag antes de `createCharge`. |
| Clientes atuais migram automaticamente? | **Não.** Pix Automático exige **autorização do pagador** no banco. Contas atuais só têm customer + cobranças avulsas. |
| Autorização obrigatória? | **Sim.** Jornada 3: QR com 1ª cobrança + consentimento de recorrência; autorização só fica `ACTIVE` após liquidar o primeiro pagamento. |
| Autorização na próxima renovação? | **Sim, é o caminho recomendado.** Na renovação com flag ON e sem `pix_automatic_authorization_id` ativo: criar autorização + QR imediato; após `AUTHORIZATION_ACTIVATED` + `PAYMENT_CONFIRMED/RECEIVED`, persistir auth id e ciclos seguintes usam `pixAutomaticAuthorizationId`. |
| Sistema sabe se Pix Recorrente foi pago? | **Sim, pelos webhooks de payment já existentes** (`PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` → status `paid` → mesma cadeia `applyPaymentEvent` / ativação-extensão). Eventos `PIX_AUTOMATIC_*` informam o **ciclo da autorização/instrução**, não substituem o payment paid. |

## 1.3 Webhooks Asaas — Pix Automático (oficial)

### Autorização

| Evento | Significado | Ação sugerida no Billing 2.0 |
|--------|-------------|------------------------------|
| `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED` | Autorização criada (aguardando consentimento/pagamento inicial) | Persistir auth id; status interno `authorization_pending` |
| `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED` | Consentimento ok; pode criar cobranças futuras | Marcar auth `ACTIVE`; liberar modo recorrente |
| `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED` | Cancelada (pagador ou fluxo) | Desligar flag efetiva; fallback PIX avulso / policy |
| `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_EXPIRED` | Expirou por falta de pagamento inicial | Limpar auth; recomeçar jornada ou fallback |
| `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED` | Recusada pelo banco | Notificar; fallback; não tentar instruções |
| `PIX_AUTOMATIC_RECURRING_ELIGIBILITY_UPDATED` | Elegibilidade da conta (subcontas) | Ops / alerta SA |

### Instrução de pagamento (cobrança não realizada / agendada / recusada)

| Evento | Significado | Ação sugerida |
|--------|-------------|---------------|
| `PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CREATED` | Instrução criada | Log + vínculo `payment` ↔ `tenant_billing` |
| `PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_SCHEDULED` | Agendada no PSP pagador | Status interno “agendado” (opcional) |
| `PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED` | Recusada (saldo/limite/PSP) | Policy: retry / gerar PIX avulso / WhatsApp |
| `PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CANCELLED` | Cancelada | Policy; se auth cancelada, cascata |

### Liquidação / falha de cobrança (já no domínio payment)

| Situação | Eventos | Já processamos? |
|----------|---------|-----------------|
| Pagamento realizado | `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` | **Sim** (via `payment.status`) |
| Cobrança vencida / não paga | `PAYMENT_OVERDUE` | **Sim** (normaliza `overdue`) |
| Cobrança não realizada (instrução) | `…_INSTRUCTION_REFUSED` (+ possível overdue) | **Não** (eventos Pix Auto inexistentes no parser) |

Docs: [Eventos Pix Automático](https://docs.asaas.com/docs/eventos-para-pix-autom%C3%A1tico), [Fluxos de webhook](https://docs.asaas.com/docs/automatic-pix-webhook-flows).

## 1.4 Estados a sincronizar (mínimo)

| Camada | Estado / campo | Fonte |
|--------|----------------|-------|
| Asaas Authorization | CREATED / ACTIVE / CANCELLED / EXPIRED / REFUSED | Webhooks `AUTHORIZATION_*` |
| Asaas Instruction | AWAITING_REQUEST / SCHEDULED / REFUSED / CANCELLED | Webhooks `INSTRUCTION_*` |
| Asaas Payment | PENDING / RECEIVED / CONFIRMED / OVERDUE / … | Webhooks `PAYMENT_*` |
| `tenant_billing` | status interno + `gateway_reference_id` | Payment webhooks |
| `subscriptions` | `active` / futuro `past_due` / `cancelled`; flag auth | Policy + webhooks |
| Tenant runtime | `active` / `suspended` | Policy dunning (hoje quase só trial/manual) |
| Novo (futuro) | `pix_automatic_authorization_id`, status auth local | Persistência Billing 2.0 |

## 1.5 Plano de migração operacional (sem big-bang)

```text
1. Deploy feature flag global: pix_automatic_enabled = false  (default)
2. Opt-in por tenant OU global após elegibilidade Asaas
3. Próxima renovação com flag ON e sem auth:
     → jornada autorização (QR composto)
4. Auth ACTIVE:
     → próximas renovações: createCharge com pixAutomaticAuthorizationId
     → respeitar janela 2–10 dias úteis antes do vencimento
5. Qualquer CANCELLED/EXPIRED/REFUSED da auth:
     → desliga efetivo; volta fluxo PIX avulso (compatível com hoje)
6. Nunca migrar em massa sem QR/consentimento
```

**Conclusão §1:** estratégia flag OFF/ON é a correta. Migração é **gradual e consentida**, não automática.

---

# 2. Compatibilidade Retroativa

## 2.1 O que pode permanecer intacto

| Ativo | Impacto se Billing 2.0 for flag-off por default |
|-------|--------------------------------------------------|
| Clientes ativos | **Nenhum** — renovação continua `createCharge` PIX/boleto/cartão aberto |
| Planos atuais | **Nenhum** — catálogo não muda |
| Cobranças abertas (`tenant_billing`) | **Nenhum** — webhooks payment atuais bastam |
| Assinaturas `type=saas` | **Nenhum** — SSOT permanece |
| Add-ons (seat / WhatsApp instances) | **Nenhum** — preço continua em `executeSaasRenewal` |
| Usuários extras / conexões WhatsApp | **Nenhum** — overrides/scheduled next cycle intactos |

## 2.2 Riscos de compatibilidade

| # | Risco | Severidade | Mitigação |
|---|-------|------------|-----------|
| 1 | Flag ON sem auth → tentativa de Pix Auto quebra renovação | P0 | Branch: sem auth ACTIVE → jornada auth **ou** fallback avulso |
| 2 | Criar instrução fora da janela 2–10 dias úteis | P0 | Scheduler antecipado; não no dia D |
| 3 | Avançar `next_billing_date` sem liquidação (já risco hoje) | P1 | Separar “ciclo emitido” vs “ciclo pago”; usar `past_due` |
| 4 | Webhooks Pix Auto sem idempotência | P1 | Estender `payment_events` / tabela dedicada com `event.id` |
| 5 | Alterar significado de `default_payment_method` | P1 | Novo campo `collection_mode` / flags, não reusar ambiguamente |
| 6 | Notificações worker one-shot (já auditado) | P1 | Flush garantido antes do exit do worker |
| 7 | Misturar CRM recovery com SaaS | P2 | Escopos separados em jobs de recovery |
| 8 | Mudança de schema sem dual-write | P2 | Colunas nullable; default OFF |

**Veredito:** implantável **sem impacto** em produção se default = fluxo atual e Pix Automático for opt-in.

---

# 3. Arquitetura Financeira (sincronização e reconciliação)

## 3.1 Cadeia canônica

```text
Asaas (Customer / Payment / Authorization)
        ↓ webhook (at-least-once)
payment_events + asaas_webhook_events (idempotência)
        ↓
tenant_billing (+ attempts)
        ↓ paid
activatePlanFromBilling / extensão de período
        ↓
subscriptions (type=saas)
        ↓
tenants (status, plan_id, periods)
```

## 3.2 Como evitar inconsistências

| Princípio | Prática |
|-----------|---------|
| Uma fatura canônica | Sempre `tenant_billing`; gateway só espelho |
| Idempotência | `payment_events(gateway, event_id)` + hash Asaas |
| Anti-regressão | `canTransition` em status de fatura |
| IdempotencyKey de charge | Já: `saas_renew_{subscriptionId}_{periodStart}` |
| Auth Pix Auto | Persistir id; nunca criar 2 auths ativas sem cancelar a anterior |
| Não avançar “pago” sem webhook/poll confirmado | Policy: `past_due` se unpaid após due |

## 3.3 Cobranças perdidas (detectar hoje / evoluir)

| Cenário | Hoje | Billing 2.0 |
|---------|------|-------------|
| Fatura pending **sem** `gateway_reference_id` | `runReconciliation` / `getPendingInvoicesWithoutPaymentId` (re-createCharge) | Manter + alertar |
| Charge no Asaas, fatura sem ref | Parcial (reconciliação cria se faltou id) | Dashboard divergência |
| **Pago no Asaas, sistema não-paid** | **Sem job SaaS de poll `getPayment`** | **P0:** reconciliador `getPayment` para open billings com ref |
| Auth ACTIVE sem cobrança no ciclo | N/A | Job: ciclos com auth e sem `tenant_billing` do período |

## 3.4 Webhooks perdidos

| Sinal | Mecanismo |
|-------|-----------|
| Reenvio Asaas | Idempotência — skip se já `processed` |
| Endpoint down | Asaas retenta; monitorar `asaas_webhook_events` `failed` |
| Evento nunca chegou | Poll periódico `getPayment` / list payments por customer |
| Pix Auto instruction missed | Poll authorization + instructions + payment |

## 3.5 Reconciliação recomendada (camadas)

1. **L1 — Operacional (já existe):** pending sem payment id → recreate charge.  
2. **L2 — Status sync (novo):** open `tenant_billing` com ref → `gateway.getPayment` → alinhar status.  
3. **L3 — Ciclo (novo):** `subscriptions.next_billing_date` vs última fatura `plan_renewal` paid/open.  
4. **L4 — Pix Auto (novo):** auth local vs Asaas GET authorization.  
5. **L5 — Acesso:** tenant `active` com fatura `overdue` além do grace → candidata a suspend (policy).

Artefatos existentes a reusar: `billingReconciliationService`, `billingOverdueStatusService`, `billingRecoveryService` (expandir escopo SaaS), Super Admin `/billing/operations`.

---

# 4. Máquina de Estados

## 4.1 Três máquinas distintas (não colapsar)

O brief lista estados misturando **tenant**, **fatura** e **assinatura**. No código são **domínios separados**:

### A) `tenants.status` (acesso à plataforma)

| Estado | Quem altera | Eventos |
|--------|-------------|---------|
| `trial` | signup / admin / revert pós-expire pending | Checkout, jobs |
| `payment_pending` | checkout compra | Aguarda 1º pagamento |
| `active` | `activatePlanFromBilling` | Webhook paid / zero-amount / card |
| `suspended` | `expireTrialsPastDue`, `cancelExpiredPendingBillings`, admin UI | Trial expirado; **não** dunning fatura automático hoje |

Relacionados: `suspended_at`, `suspension_reason` (`trial_expired`; `payment_overdue` documentado mas **sem writer**).

### B) `tenant_billing.status` (fatura)

`pending` → `waiting_payment` → `processing` → `paid`  
também: `overdue`, `cancelled`, `failed`, `refunded`

| Quem | Onde |
|------|------|
| Create pending | `createInvoice` / renovação / checkout |
| Gateway → interno | `applyPaymentEvent` + `statusNormalizer` |
| overdue | `syncOverdueBillingStatuses` + webhook OVERDUE |
| cancelled | expire pending, cancel siblings, admin flows |
| paid → ativa plano | `activatePlanFromBilling` |

Attempts: mesmos 8 status em `tenant_billing_payment_attempts`.

### C) `subscriptions.status` (contrato recorrente SaaS)

| Estado | Uso real SaaS |
|--------|----------------|
| `active` | Sim — pós ativação |
| `cancelled` | Sim — cancel / expire `cancel_at_period_end` |
| `past_due` | **Schema only — sem UPDATE no SaaS** |
| `paused` / `trialing` | Quase só CRM lifecycle |

### D) Jobs `billing_recurring_jobs.status`

`pending` → `processing` → `completed` \| `failed` \| `cancelled` (+ `retry_at`, `attempts`).

## 4.2 Mapa do brief → realidade

| Estado do brief | Onde vive | Observação |
|-----------------|-----------|------------|
| TRIAL | `tenants.status=trial` | OK |
| ACTIVE | tenant e/ou subscription | **Duplicado semântico** — distinguir acesso vs contrato |
| PENDING | fatura `pending` **ou** tenant `payment_pending` | **Homônimos perigosos** |
| WAITING_PAYMENT | fatura | OK |
| PAST_DUE | subscription (morto) | Ativar no Billing 2.0 ou não expor |
| OVERDUE | fatura | OK |
| SUSPENDED | tenant | OK; ligar a policy |
| CANCELLED | fatura e/ou subscription | Distinguir |
| EXPIRED | não há status único; trial_expired em reason / jobs | Evitar novo enum genérico |
| REACTIVATED | não é status — é **transição** para `active` | Modelar como evento, não estado |

## 4.3 Duplicados / desnecessários

| Item | Veredito |
|------|----------|
| `overdue` (billing) vs `past_due` (subscription) | Complementares se `past_due` passar a significar “contrato em atraso”; hoje `past_due` é morto |
| `asaas_status` / `gateway_status` vs `status` | Espelho vs domínio — manter ambos |
| `payment_pending` (tenant) vs `pending` (billing) | Manter; documentar nomes |
| REACTIVATED como status | **Desnecessário** — usar evento/audit log |
| EXPIRED como status tenant | Preferir `suspended` + reason |

## 4.4 Transições-alvo Billing 2.0 (contrato)

```text
subscription.active + fatura unpaid após due+grace
  → subscription.past_due
  → (policy) tenant.suspended reason=payment_overdue
  → pagamento paid
  → subscription.active + tenant.active  (reativação = transição, não estado)
```

---

# 5. Arquitetura do Motor Configurável

## 5.1 Comparativo

| Critério | A Hardcoded | B Tabela de Config | C Rule Engine | D Workflow |
|----------|-------------|--------------------|---------------|------------|
| Complexidade | Baixa curto prazo | **Baixa-média** | Alta | Muito alta |
| Escalabilidade regras | Ruim | Boa para dunning SaaS | Alta | Alta |
| Manutenção | Ruim (deploys) | **Boa** | Média (DSL) | Cara |
| Flexibilidade | Baixa | Média-alta (o brief) | Alta | Máxima |
| Compat. Billing atual | OK se ifs no worker | **Melhor fit** | Overkill | Overkill |
| UI Super Admin | Difícil | **Natural** (form) | Precisa builder | Precisa designer |

## 5.2 Recomendação: **B — Tabela de Configuração (+ interpretador fixo)**

Não é “hardcoded” nem “Camunda”.

```text
billing_collection_policy (global, 1 linha ou versionada)
  renew_card_auto: bool
  generate_pix_auto: bool
  pix_automatic_enabled: bool      -- flag Pix Automático Asaas
  max_attempts: int
  attempt_interval_days: int
  actions_after_fail: jsonb  -- [create_pix, whatsapp, email]
  suspend_after_days: int
  cancel_after_days: int
  reactivate_on_paid: bool

CollectionPolicyEngine.interpret(event, policy, context)
  → lista de Actions tipadas
  → executores já existentes (createCharge, publish notification, suspend tenant)
```

**Por quê não C/D agora:** o brief descreve um **dunning linear parametrizado**, não um grafo arbitrário. Rule/Workflow aumentam custo sem ganho no MVP.

**Evolução:** se no futuro houver regras por plano/tenant/segmento, versionar policy (`policy_id` em subscription) ou promover a Rule Engine **sem** trocar os executores.

**Compatibilidade:** `billingSettingsService` (grace / auto_suspend) é o embrião — hoje grace só copia para subscription; `auto_suspend_enabled` **não tem consumidor**. Billing 2.0 deve **passar a consumir** esses knobs no policy engine.

---

# 6. Integração com WhatsApp (e canais) — mapa de eventos

## 6.1 Canais existentes (plataforma SaaS)

| Canal | Status |
|-------|--------|
| WhatsApp (instância plataforma / Uaz) | ✅ `platformBusinessEventMultiChannel` + PIX follow-up |
| Email | ✅ mesmo pipeline |
| Push | ❌ não no motor plataforma |
| SMS | ❌ |
| Webhook outbound (cliente) | ❌ não para billing SaaS (só inbound Asaas) |

Tipo atual: `PlatformBusinessChannel = 'whatsapp' | 'email'`.

## 6.2 Eventos plataforma já publicados (ganchos)

| Event key | Momento |
|-----------|---------|
| `platform.billing.charge.created` | Renovação / cobrança criada |
| `platform.billing.charge.overdue` | Sync overdue |
| `platform.billing.payment_confirmed` | Paid |
| `platform.trial.*` / `platform.account.created` | Lifecycle adjacente |

## 6.3 Pontos futuros para Billing 2.0 (não implementar agora)

| Evento sugerido | Canais naturais |
|-----------------|-----------------|
| `platform.billing.renewal.started` | email (ops) |
| `platform.billing.card.attempt_failed` | WhatsApp, email |
| `platform.billing.pix.created` / `pix.regenerated` | WhatsApp (copy-paste), email |
| `platform.billing.pix_automatic.authorization_required` | WhatsApp, email |
| `platform.billing.pix_automatic.authorization_activated` | email |
| `platform.billing.pix_automatic.instruction_refused` | WhatsApp, email |
| `platform.billing.collection.retry_scheduled` | — (log) / email |
| `platform.billing.account.suspended` | WhatsApp, email |
| `platform.billing.account.reactivated` | WhatsApp, email |
| `platform.billing.subscription.cancelled` | email |
| `platform.billing.plan.changed` | email |
| `platform.billing.payment_method.changed` | email |

**Extensão futura de canais:** adicionar `'push' | 'sms' | 'webhook'` em `PlatformBusinessChannel` sem mudar publishers — só novos dispatchers.

---

# 7. Estratégia de Logs e Auditoria

## 7.1 O que registrar

| Ação | Nível | Campos mínimos |
|------|-------|----------------|
| Criação cobrança | audit | billing_id, amount, method, gateway_ref, correlation_id |
| Renovação | audit | subscription_id, cycle_key, job_id, outcome |
| Tentativa cartão | audit+sec | billing_id, success/fail, gateway code (sem PAN) |
| Tentativa PIX / novo PIX | audit | attempt_id, qr issued_at |
| Pix Automático auth/instruction | audit | auth_id, instruction_id, status |
| Webhook recebido | audit | event_id, event type, payload hash |
| Webhook inválido | security | reason, IP/token fail |
| Suspensão / cancelamento / reativação | audit | actor (system\|admin\|webhook), reason |
| Mudança plano / método | audit | before/after |

## 7.2 Onde armazenar

| Store | Uso |
|-------|-----|
| `asaas_webhook_events` / `payment_events` | Ingresso gateway (já) |
| `platform_notification_deliveries` | Envios WhatsApp/email (já) |
| `billing_recurring_jobs` + traces | Jobs renovação (já) |
| **Novo sugerido:** `billing_audit_events` (append-only) | Trilha unificada SaaS (actor, action, entity, payload) |
| Logs estruturados (`billingLog`) | Ops/tempo-real; **não** substituem audit DB |

## 7.3 Facilitar auditorias futuras

- Correlation id por ciclo: `subscription_id + period_start` (já parcialmente em idempotency).
- UI Super Admin → **Logs** filtrável por tenant, billing_id, event_type.
- Nunca logar número de cartão / CVV; só brand/last4 se gateway devolver.
- Export CSV para suporte financeiro.

---

# 8. Compatibilidade Multi Gateway

## 8.1 O que já está desacoplado

- Interface `PaymentGateway` (`createCharge`, `ensureCustomer`, `getPayment`, `cancelPayment`, `payWithCreditCard?`).
- `getActiveGateway({ billingType: 'saas' })` + `payment_gateway_configs` scope global.
- Status interno normalizado (`InternalPaymentStatus`).
- `payment_events` multi-gateway.

Comentário no próprio tipo: *“Permite trocar Asaas por Stripe/PagarMe sem alterar serviços que chamam getActiveGateway().”*

## 8.2 Ainda acoplado ao Asaas (desacoplar no Billing 2.0)

| Ponto | Problema | Direção |
|-------|----------|---------|
| `tenants.asaas_customer_id` | Nome/coluna Asaas | Preferir só `payment_customers` |
| `gatewayRegistry` só `asaas` | Sem Stripe/MP/Iugu/Pagar.me | Registrar adapters |
| Rotas `/webhooks/asaas` | Path vendor | Manter + `/webhooks/{gateway}` genérico |
| `asaasEvents` / parser | Só PAYMENT_* Asaas | Parser por gateway; Pix Auto = capability Asaas |
| Fallback env `ASAAS_API_KEY` | Bypass config | OK como fallback; não padrão |
| Pix Automático / Assinaturas Asaas | Capability vendor-specific | Interface opcional: `supportsPixAutomatic`, `createRecurringAuthorization` |
| Mercado Pago | Só CRM, fora do registry SaaS | Novo adapter se SaaS multi-gateway |

## 8.3 Billing Core deve permanecer gateway-agnóstico

```text
Billing Core (subscriptions, tenant_billing, policy, jobs)
        ↓
PaymentGateway (+ optional RecurringCapabilities)
        ↓
AsaasAdapter | StripeAdapter | MercadoPagoAdapter | …
```

**Pix Automático** e **Assinatura nativa** são *capabilities* do adapter Asaas — o core só chama se `policy.pix_automatic_enabled && gateway.capabilities.pixAutomatic`.

**Veredito:** arquitetura **permite** Stripe / Mercado Pago / Pagar.me / Iugu no futuro **sem reescrever** o core, desde que Billing 2.0 não embuta HTTP Asaas em `executeSaasRenewal` / policy engine.

---

# 9. Estrutura recomendada — Super Admin Financeiro

## 9.1 Estrutura proposta no brief

```text
Financeiro
├── Dashboard
├── Cobranças
├── Assinaturas
├── Cobrança Automática
├── Métodos de Pagamento
├── Gateways
├── Webhooks
├── Logs
├── Recuperação
├── Configurações
└── Métricas
```

## 9.2 Avaliação

**Adequada como visão-alvo**, com ajustes para o que já existe e para evitar duplicação.

## 9.3 Estrutura recomendada (alinhada ao produto atual)

```text
Financeiro                          (/superadmin/financeiro — hub)
├── Dashboard                       (já: SuperAdminDashboard + cards)
├── Cobranças da plataforma         (já: /platform-billings)
├── Assinaturas                     (NOVO — lista subscriptions type=saas)
├── Cobrança Automática             (NOVO — policy engine UI)  ★ Billing 2.0
├── Ciclos                          (já: /subscription-cycles)
├── Gateways & métodos              (já: /pagamentos — unificar “métodos”)
├── Operações & Recuperação         (já: /billing/operations + recovery)
├── Webhooks                        (NOVO — status asaas_webhook_events / health)
├── Logs de auditoria               (NOVO — billing_audit_events)
├── Notificações                    (já existe SA platform notifications — linkar)
├── Relatórios / KPIs               (já: /reports + evoluir)
└── Configurações                   (grace, auto_suspend, flags — já API billing/settings)
```

### Melhorias vs brief

1. **Unificar** “Métodos de Pagamento” + “Gateways” numa tela (já é `/pagamentos`).  
2. **Separar** “Cobrança Automática” (policy) de “Configurações” (flags técnicas).  
3. **Recuperação** dentro de Operações (já há health/recovery).  
4. **Métricas** = Relatórios + Dashboard (evitar três telas de KPI).  
5. Incluir link para **Notificações** (canais WhatsApp/email já críticos ao dunning).

---

# 10. KPIs

## 10.1 Já obtíveis (ou quase) com estrutura atual

| KPI | Fonte | Qualidade |
|-----|-------|-----------|
| Cobranças geradas / pagas / canceladas / overdue | `tenant_billing` | ✅ Boa |
| Recebido / pending / overdue cents | Dashboard SA | ✅ |
| Assinaturas ativas | `subscriptions` status=active type=saas | ✅ |
| Assinaturas canceladas | idem | ✅ |
| Tenants active / suspended / trial | `tenants` | ✅ |
| Renovações (jobs completed) | `billing_recurring_jobs` | ✅ |
| Tempo médio de pagamento | `due_date` → `paid_at` | ✅ calculável |
| MRR/ARR **aproximado** | Hoje dashboard usa **catálogo** `plans.price_cents`; analytics comercial tem contratado | ⚠️ Corrigir para `subscriptions.amount_cents` / contracted |
| ARPU | receita / ativos | ⚠️ depende MRR correto |
| Inadimplência (estoque overdue) | `tenant_billing` overdue | ✅ |
| Falhas de job renovação | jobs failed | ✅ (≠ falha cartão) |

## 10.2 Precisam de novos dados / instrumentação

| KPI | Gap |
|-----|-----|
| Falhas de cartão | Persistir resultado `payWithCreditCard` (código recusa) |
| Falhas PIX / Pix Automático | Eventos instruction refused + auth cancelled |
| Taxa de recuperação | Funnel overdue → paid após dunning (precisa timestamps de actions) |
| Chargebacks | Handler dedicado + flag em billing |
| Churn rate temporal | Hoje reports ≈ contagem status; precisa coorte cancelamentos no tempo |
| LTV | Histórico pago por tenant + lifetime |
| Assinaturas suspensas | Hoje suspende **tenant**; subscription `paused`/`past_due` pouco usados |
| Pix Automático adoption | % com auth ACTIVE |
| MRR contratado vs list price | Já parcialmente em commercial analytics — promover ao Dashboard |

---

# 11. Riscos Técnicos (Fase 2)

| # | Criticidade | Risco |
|---|-------------|-------|
| 1 | P0 | Assumir migração automática para Pix Automático sem consentimento |
| 2 | P0 | Instrução Pix Auto fora da janela BACEN/Asaas (2–10 dias úteis) |
| 3 | P0 | Divergência “pago no gateway / não pago no sistema” sem reconciliador L2 |
| 4 | P1 | `past_due` / `auto_suspend` mortos → policy “suspender” sem efeito se só setar settings |
| 5 | P1 | Avanço de ciclo na renovação independente da liquidação |
| 6 | P1 | Acoplar Pix Automático direto no core em vez de capability do adapter |
| 7 | P1 | Workflow engine (D) prematuro → atraso e complexidade |
| 8 | P2 | MRR dashboard enganoso (catálogo ≠ contratado) para governança financeira |
| 9 | P2 | Notificações de renovação perdidas no worker one-shot |
| 10 | P2 | Homônimos PENDING (tenant vs billing) na UI SA |

---

# 12. Recomendação Final

1. **Migrar com feature flag** (global + opt-in): OFF = comportamento atual 100% preservado.  
2. **Pix Automático = jornada na próxima renovação** (consentimento); nunca backfill silencioso.  
3. **Motor configurável = Tabela de Config + interpretador fixo (B)**; reutilizar/expandir `billingSettingsService`.  
4. **SSOT continua** `subscriptions` + `tenant_billing` + jobs; Asaas executa cobrança/autorização.  
5. **Governança P0:** reconciliador L2 (`getPayment`) + audit log append-only + ativar `past_due` + consumir `auto_suspend`.  
6. **Multi-gateway:** novas features só via `PaymentGateway` / capabilities; não espalhar HTTP Asaas.  
7. **UI:** adicionar **Cobrança Automática**, **Assinaturas**, **Webhooks/Logs** no hub Financeiro; unificar Gateways/Métodos.  
8. **KPIs:** corrigir MRR para contratado; instrumentar falhas cartão/Pix Auto e recovery funnel.  
9. **Não** adotar Rule Engine/Workflow na v1.  
10. **Sequência sugerida pós Fase 1:**  
    - Phase2-A: policy table + UI + consumir grace/suspend  
    - Phase2-B: reconciliação L2 + audit events + past_due  
    - Phase2-C: token cartão renovação (Fase 1 Modelo B+)  
    - Phase2-D: Pix Automático opt-in + webhooks `PIX_AUTOMATIC_*`  
    - Phase2-E: KPIs / Dashboard contratado  

Este documento + a Fase 1 formam a baseline do **Plano de Implantação Billing 2.0**.

---

## Apêndice — Referências de código (investigação)

| Tema | Paths principais |
|------|------------------|
| Renovação SaaS | `packages/backend/src/services/billingRenewalEngine/executeSaasRenewal.ts` |
| Webhook payment | `modules/gateways/asaas/webhooks/*`, `modules/payments/webhook/*` |
| Settings grace/suspend | `services/billingSettingsService.ts` |
| Reconciliação | `services/billingReconciliationService.ts` |
| Overdue sync | `services/billingOverdueStatusService.ts` |
| PaymentGateway | `modules/payments/paymentGatewayTypes.ts` |
| Notificações | `services/platformNotifications/*` |
| Hub SA | `src/layouts/superadminHubConfig.ts`, `superadminNavConfig.ts` |
| Fase 1 | `docs/architecture/commercial/AUDIT_SUPERADMIN_BILLING_ASAAS.md` |

**Fim da auditoria Fase 2.**
`)