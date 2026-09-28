# AUDIT — Legacy Retirement Readiness

| Campo | Valor |
|-------|-------|
| **Nome** | `AUDIT_LEGACY_RETIREMENT_READINESS` |
| **Versão** | 1.0 |
| **Tipo** | `investigation_only` |
| **Prioridade** | ALTA |
| **Escopo** | Billing SaaS Super Admin (legado + Billing 2.0) |
| **Data** | 2026-07-27 |
| **Modo** | READ ONLY — nenhum código, migration, flag, banco ou commit foi alterado por esta auditoria |
| **Pré-requisito** | [`AUDIT_BILLING_PIPELINE_OWNERSHIP_RUNTIME.md`](./AUDIT_BILLING_PIPELINE_OWNERSHIP_RUNTIME.md) |
| **Fora de escopo** | CRM B2B2C (`customer_invoices`) exceto paths compartilhados (webhook/overdue) |

**Objetivo:** identificar o que no Billing legado permanece **essencial**, o que existe **só por compatibilidade/rollout**, e o que é **morto/inativo** — **sem** propor remoção, refactor ou implementação.

---

## Veredito executivo

O **spine legado de renovação/cobrança/pagamento/ativação continua indispensável**.  
O Billing 2.0 é uma **camada de extensão gated** (policy, ops, capabilities).  

**Não há maturidade para aposentar o pipeline canônico** (`scheduler` → `worker` → `executeSaasRenewal` → invoice/charge → webhook → `activatePlanFromBilling`).  

Há, sim: (1) **código/flag mortos**; (2) **branches XOR de compatibilidade** (notify/card/pix no renewal vs engine); (3) **infra de rollout** (flags OFF); (4) **skeleton experimental** (Stripe). Isso documenta *readiness de classificação*, não autorização de corte.

---

# PARTE 1 — INVENTÁRIO DO LEGADO

| Componente | Arquivo / módulo | Responsabilidade | Quem utiliza | Frequência | Executa em runtime? | Feature Flag | Motivo da permanência |
|------------|------------------|------------------|--------------|------------|---------------------|--------------|------------------------|
| Scheduler renovação | `scripts/runRecurringScheduler.ts` · `enqueueRenewalJobs` | Enfileira jobs SaaS | Cron externo `billing:scheduler` | Ciclo de cobrança | **Sim** (se cron ativo) | — | **SSOT de enqueue** |
| Worker renovação | `scripts/runRecurringWorker.ts` · `processNextBatch` | Claim + executa renovação | Cron `billing:worker` | Ciclo | **Sim** | — | **SSOT de execução** |
| BillingRenewalEngine | `billingRenewalEngine/billingRenewalEngine.ts` | Roteia SaaS → execute | Worker | Ciclo | **Sim** | — | Wrapper fino do legado |
| executeSaasRenewal | `executeSaasRenewal.ts` | Invoice + charge + notify XOR + hook B2 | Engine | Ciclo | **Sim** | Branches: `card_auto_renew`, `pix_automatic`, ownership engine | **Núcleo SaaS** |
| createInvoice | `invoiceService.ts` | Persiste `tenant_billing` | Renewal, checkout, admin | Alta | **Sim** | — | Persistência canônica |
| createCharge / Asaas | `asaasService` · `asaasClient` | Cobrança no PSP | Renewal, checkout, policy, L1 | Alta | **Sim** | — | Único adapter produtivo SaaS |
| Webhook Asaas | `asaasWebhook.ts` · `webhookCore` | Ingresso eventos | Asaas HTTP | Contínua | **Sim** | — | Liquidação |
| applyPaymentEvent | `paymentDomainService.ts` | Status + hooks | Webhook, L2, captura card | Contínua | **Sim** | — | Writer financeiro |
| activatePlanFromBilling | `subscriptionService.ts` | Tenant/plano pós-pago | Paid path | Contínua | **Sim** | — | Ativação canônica |
| Notify charge created | `publishPlatformBillingChargeCreated` | WA/email cobrança | `executeSaasRenewal` se engine OFF | Por renovação | **Sim** (default) | XOR com `collection_policy_engine_enabled` | Compatibilidade notify |
| Overdue sync | `billingOverdueStatusService.ts` · poll `index.ts` | Marca overdue + notify XOR | In-process API | ~5 min | **Sim** | XOR notify | Status de fatura |
| Trial expire | `expireTrialsPastDue` · `trial:expire` | Suspende trials | Cron/script + poll | Diária/horária | **Sim** | — | Lifecycle trial (não B2) |
| Reconciliação L1 | `billingReconciliationService.ts` · `billing:reconciliation` | Re-createCharge idempotente | Ops/cron | Ops | **Sob demanda** | `reconciliation_auto` (via L2 script) | Recuperação crash |
| Recovery ops | `billingRecoveryService` · `billing:ops-reconciliation` | Scan/repair leve | Ops API/CLI | Ops | **Sob demanda** | — | Operação |
| Checkout `/planos` `/saas-pay` | `subscriptionService` · `publicSaasBillingController` | Compra / pagar fatura | Usuários | Contínua | **Sim** | Pix auto UI gated | Aquisição + pagamento manual |
| Cert scripts | `billing:cert-*` · `production-*` | Lab/certificação migração | Manual | Rara | **Sob demanda** | — | Tooling histórico / cert |
| Mercado Pago (CRM) | `gateways/mercado_pago/*` | CRM tenant | CRM | CRM | **Sim (CRM)** | — | Fora do spine SaaS B2 |

---

# PARTE 2 — COMPONENTES LEGADOS (essencial vs compatibilidade)

| Item | Ainda essencial? | Ou só compatibilidade? | Evidência |
|------|------------------|------------------------|-----------|
| **scheduler** | **Essencial** | — | Único enqueue SaaS |
| **worker** | **Essencial** | — | Único processador de jobs |
| **renewal (`executeSaasRenewal`)** | **Essencial** | Branches card/pix/notify = **compatibilidade XOR** com engine | B2 não cria invoice |
| **createInvoice** | **Essencial** | — | Única criação de ciclo |
| **createCharge** | **Essencial** | — | Adapter de cobrança |
| **activatePlanFromBilling** | **Essencial** | — | Policy `reactivate` chama o mesmo |
| **webhook handlers** | **Essencial** | Branch PIX_AUTOMATIC = extensão B2 no mesmo endpoint | Liquidação PAYMENT_* |
| **notification publishers (legado)** | Essencial **enquanto** engine OFF | Torna-se **compatibilidade XOR** se engine ON | `shouldCollectionPolicyOwnNotifications` |
| **overdue sync** | **Essencial** | Notify legado = XOR | Marca status independente de dunning |
| **trial expire** | **Essencial** (produto trial) | Fora do Collection Policy | Path paralelo legítimo |
| **recovery** | Essencial **ops** | — | Não substitui renewal |
| **reconciliation L1** | Essencial **ops** | — | Camada distinta de L2 |
| **scripts CLI** scheduler/worker | **Essencial** | cert-* = tooling | |
| **adapters Asaas** | **Essencial** | Stripe skeleton = experimental | |
| **services/controllers checkout** | **Essencial** | — | Aquisição |

---

# PARTE 3 — CÓDIGO MORTO / INATIVO

| Item | Classificação | Evidência |
|------|---------------|-----------|
| Flag `billing2.pix_auto_generate` | **Código morto (flag)** | Catalogada/seed/UI snapshot; **nenhum** `isBilling2FlagEnabled('pix_auto_generate')` no runtime. PIX avulso usa policy `generate_pix_auto`. |
| Stub `pix_automatic_deferred_sprint10` | **Removido** | S10 — não existe |
| Stub `charge_card` | **Removido** | S9 — executor real |
| `execute.ts` `unknown_action` → stub | **Defesa** | Só actions inválidas |
| Stripe SaaS skeleton | **Experimental / inerte** | Registry + `is_enabled=false`; lança em operações; flag `multi_gateway` OFF |
| Collection Policy Engine (default OFF) | **Inativo (caminho vivo)** | Código executável; no-op por flag |
| Dunning / L2 apply | **Inativo (gated)** | Dry-run / flag OFF |
| Card auto / Pix Automático | **Inativo (gated)** | Flags destrutivas OFF |
| Docs antigos citando stubs S9/S10 | **Doc desatualizado** | Não é runtime |
| Scripts `billing:cert-lab` / `pipeline-cert` / `production-*` | **Tooling / experimental ops** | Não no cron de cobrança diária |
| Dual write Asaas columns (migrations antigas 74) | **Já aposentado no schema** | Fase genérica `gateway_*` |
| Endpoints obsoletos SaaS renewal paralelos | **Não encontrados** | Um pipeline de renovação |

---

# PARTE 4 — FEATURE FLAGS

| Flag | Default | ON em prod? (estado esperado) | Nunca usada? | Temp / permanente | Ainda necessária? | Bloqueia remoção de código? |
|------|---------|-------------------------------|--------------|-------------------|-------------------|-----------------------------|
| `collection_policy_engine_enabled` | OFF | Não (default) | Não | **Temporária de cutover** (XOR notify/actions) | Sim, enquanto dual-path | **Sim** — sem ela, branches legado notify/card/pix no renewal |
| `dunning_enabled` | OFF | Não | Não | Permanente (produto) | Sim | Não remove spine |
| `reconciliation_l2_enabled` | OFF | Não | Não | Permanente (ops) | Sim | Não |
| `reconciliation_auto` | ON | Depende ops | Não | Permanente (ops) | Sim | Não |
| `card_auto_renew` | OFF | Não | Não | Permanente (produto) | Sim | Gates captura |
| `pix_automatic` | OFF | Não | Não | Permanente (produto) | Sim | Gates S10 |
| `pix_auto_generate` | ON | N/A | **Sim (nunca lida)** | **Morta** | Não (operacionalmente) | Não bloqueia spine |
| `whatsapp_charge_notify` / `email_charge_notify` | ON | Via engine se ON | Não | Permanente | Sim | Só actions notify |
| `auto_suspend` / `auto_cancel` | OFF | Não | Não | Permanente | Sim | Gates destrutivos |
| `auto_reactivate` | ON | Via engine se ON | Não | Permanente | Sim | — |
| `past_due_writer_enabled` | OFF | Não | Não | Temp → permanente após confiança | Sim | Writer |
| `dashboard_mrr_contracted` | OFF | Não | Não | Permanente (UI) | Sim | Só métrica |
| `detailed_logs` | ON | — | Não | Permanente (ops) | Sim | — |
| `collection_policy_db_read` | ON | — | Não | Temp rollback (memory defaults) | Sim | Reader |
| `multi_gateway` | OFF | Não | Não | Permanente quando 2º GW real | Sim (futuro) | Resolver fallback Asaas |

*“ON em produção” = expectativa de defaults atuais / rollout; esta auditoria não inspecionou valores reais do banco de prod.*

---

# PARTE 5 — COMPATIBILIDADE

Componentes que existem **principalmente** porque:

### Rollout ainda não terminou / Feature Flag OFF

- Collection Policy Engine path (código pronto, runtime no-op)
- Dunning apply, L2 apply
- Captura cartão token / Pix Automático
- Writer `past_due`
- Multi-gateway (resolver força Asaas)

### Dual-path de segurança (engine OFF = legado)

- `publishPlatformBillingChargeCreated` / overdue notify legado
- Branches card/pix **dentro** de `executeSaasRenewal` quando engine não “owns”

### Clientes / modelo atual

- Checkout avulso PIX/boleto/cartão
- Trial expire (independente de B2)
- Token `/saas-pay` e prepare-payment

### Migração futura ainda não ocorreu

- Consolidação notify **somente** na policy (ainda XOR)
- Adapter Stripe real (só skeleton)
- Flag morta `pix_auto_generate` ainda no catálogo/seed

---

# PARTE 6 — MAPA DE DEPENDÊNCIAS

```text
LEGADO (spine)
  scheduler → jobs → worker → executeSaasRenewal
       │                         │
       │                         ├─ createInvoice
       │                         ├─ createCharge ──────────────► GATEWAY (Asaas)
       │                         ├─ notify legado (se engine OFF)
       │                         └─ scheduleCollectionPolicyExtensionPoint
       │                                      │
       │                                      ▼
       │                         BILLING 2.0 Collection Policy
       │                         (noop se flag OFF)
       │                                      │
GATEWAY ◄─────────────────────────────────────┼── create_pix / charge_card / pix_auto
       │                                      │
       ▼                                      │
WEBHOOK PAYMENT_* → applyPaymentEvent ────────┤
       │                                      │
       ├─ activatePlanFromBilling             │
       └─ hook payment.paid ──────────────────┘

OVERDUE SYNC (legado) → status + notify XOR + past_due (gated) + hook overdue

DUNNING / L2 (B2 ops) → eventos / getPayment → mesmo applyPaymentEvent

DASHBOARD / Assinaturas / Flags / Cobrança Automática
       └─ leitura + config (não geram renovação)
```

### O que impede “remover” cada bloco legado (somente dependência, sem plano)

| Bloco legado | Impedimento |
|--------------|-------------|
| Scheduler/worker/renewal | B2 **não** gera invoice de ciclo |
| createInvoice/createCharge | Policy/L1/checkout/renewal dependem |
| Webhook + applyPaymentEvent | Única liquidação; L2 reusa |
| activatePlanFromBilling | Ativação + reactivate policy |
| Notify legado | Engine OFF (estado default) |
| Overdue sync | Status fatura mesmo sem dunning |
| Trial expire | Produto trial |
| Asaas adapter | Único PSP SaaS produtivo |

---

# PARTE 7 — CLASSIFICAÇÃO PARA REMOÇÃO FUTURA

**Sem indicar como remover.** Apenas categorias.

### Categoria A — Nunca deverá ser removido (conceitualmente)

- Conceito de renovação periódica SaaS
- Persistência `tenant_billing` / `subscriptions`
- Liquidação via webhook + status interno
- Ativação de tenant pós-pago
- Abstração `PaymentGateway` + registry

*(Implementações concretas podem evoluir; a responsabilidade permanece.)*

### Categoria B — Poderá ser consolidado futuramente

- Notify: unificar em policy **após** engine estável ON (hoje dual XOR)
- Captura card / jornada Pix Auto: unificar entrypoint (hoje renewal **ou** policy)
- Overdue sync + dunning: papéis podem fundir-se operacionalmente após soak
- L1 + L2: camadas ops distintas; consolidação conceitual futura possível

### Categoria C — Existe apenas por compatibilidade / rollout

- Branches XOR em `executeSaasRenewal` (notify/card/pix quando engine OFF)
- Flag `collection_policy_engine_enabled` como master cutover
- Flag `collection_policy_db_read` (forçar defaults em memória)
- Fallback resolver Asaas quando `multi_gateway` OFF

### Categoria D — Provavelmente classificável como aposentável após estabilização B2

- Flag **morta** `pix_auto_generate` (nunca lida)
- Skeleton Stripe **como implementação** (até existir adapter real — o *slot* registry permanece)
- Scripts de certificação/lab de migração antiga se não forem mais usados em ops
- Docs desatualizados que ainda citam stubs S9/S10

**Não** classificar como D: scheduler, worker, `executeSaasRenewal` (geração), `createInvoice`, webhook payment, `activatePlanFromBilling`.

---

# PARTE 8 — RISCOS (se B2 “totalmente em produção” hoje)

Se **todas** as flags destrutivas/úteis de B2 fossem ligadas **hoje**:

### Ainda precisariam permanecer

- Scheduler + worker + `executeSaasRenewal` (criação de fatura)
- `createInvoice` / `createCharge` (ou path pix auto sobre o mesmo billing)
- Webhook `PAYMENT_*` + `applyPaymentEvent`
- `activatePlanFromBilling`
- Overdue sync (status)
- Trial expire (se produto trial existir)
- Adapter Asaas (Stripe skeleton **não** substitui)
- Schema B2 (298–302) + policy DB coerente
- Crons ops: dunning + L2 (além de renewal)

### Não poderiam ser removidos

- Todo o spine acima
- Idempotência de ciclo (`subscription_id` + `period_start`, `saas_renew_*`)

### Dependem de Feature Flags

- Engine, dunning, L2 apply, card, pix auto, past_due, multi_gateway, notifies do engine, suspend/cancel

### Remoção que causaria regressão (hipotética)

| Remoção hipotética | Regressão |
|--------------------|-----------|
| Worker/scheduler | Sem renovações |
| createInvoice | Sem faturas de ciclo |
| Webhook/applyPayment | Sem paid / sem ativação |
| Notify legado **com engine OFF** | Silêncio de cobrança |
| Asaas adapter | Sem cobrança SaaS |
| XOR notify **sem** engine ON | Dupla ou zero notificação |

---

# PARTE 9 — MATRIZ DE MATURIDADE

| Componente | Classificação | Justificativa |
|------------|---------------|---------------|
| Scheduler / worker / executeSaasRenewal | **Crítico** | Único gerador de ciclo |
| createInvoice / createCharge / Asaas | **Crítico** | Persistência + PSP |
| Webhook PAYMENT + applyPaymentEvent | **Crítico** | Liquidação |
| activatePlanFromBilling | **Crítico** | Acesso do tenant |
| Overdue sync | **Essencial** | Estado de fatura |
| Trial expire | **Essencial** | Lifecycle comercial |
| Notify legado | **Essencial** hoje / **Compatibilidade** se engine ON | XOR |
| L1 reconciliation | **Essencial** (ops) | Recuperação |
| Collection Policy (código) | **Experimental→Essencial** após cutover | Default inativo |
| Dunning / L2 | **Experimental** (gated) | Produto ops B2 |
| Card token / Pix Automático | **Experimental** (gated) | Pós-MVP |
| Multi-gateway / Stripe skeleton | **Experimental** | Skeleton inerte |
| Dashboard / Assinaturas SA / Flags UI | **Essencial** (ops/produto read) | Não geram cobrança |
| Flag `pix_auto_generate` | **Obsoleto** | Sem reader |
| Dual branches XOR no renewal | **Compatibilidade** | Cutover engine |
| Cert scripts lab | **Aposentável futuramente** (tooling) | Fora do path diário |

---

# PARTE 10 — CONCLUSÃO

| # | Pergunta | Resposta | Evidência |
|---|----------|----------|-----------|
| 1 | O Billing legado ainda possui componentes indispensáveis? | **✅ SIM** | Spine renovação + invoice + charge + webhook + ativação |
| 2 | Existe código apenas para compatibilidade? | **✅ SIM** | XOR notify/card/pix; fallback multi_gateway OFF; engine flag cutover |
| 3 | Existe código morto? | **✅ SIM** | Flag `pix_auto_generate` sem reader; skeleton Stripe inerte; stubs S9/S10 já removidos |
| 4 | Existem Feature Flags que poderão ser classificadas para aposentadoria futura? | **✅ SIM** | `pix_auto_generate` (morta); cutover flags após soak (`collection_policy_engine_enabled` como XOR) |
| 5 | Existe infraestrutura temporária de rollout? | **✅ SIM** | Flags OFF default; dry-run L2/dunning; dual-path renewal |
| 6 | Existe código duplicado que permanece apenas por segurança? | **✅ SIM** | Notify legado ∥ policy; card/pix no renewal ∥ actions (XOR explícito) |
| 7 | O Billing 2.0 já atingiu maturidade suficiente para **iniciar um plano futuro** de aposentadoria do legado? | **❌ NÃO** (para o spine) / **✅ SIM** (apenas para inventário de compatibilidade/flags mortas) | B2 **não** substitui gerador de renovação; MVP QA ainda registrou NO-GO; maioria flags OFF |
| 8 | O sistema está preparado para uma futura fase de simplificação arquitetural? | **❌ NÃO** (ainda não) | Falta cutover real da engine, soak de automations, adapter 2º GW real, limpeza de flag morta — **documentado**, não autorizado |

**Leitura da pergunta 7–8:**  
Há maturidade para **continuar documentando e classificando** (esta auditoria).  
**Não** há maturidade para tratar o legado canônico como candidato a aposentadoria. O Billing 2.0, no estado atual, é **evolução envelopada**, não substituto.

---

## Síntese final

1. **Legado = cérebro operacional de renovação e liquidação.**  
2. **Billing 2.0 = política, observabilidade, opt-ins e ops** — gated.  
3. **Compatibilidade** = dual-path XOR + flags OFF.  
4. **Morto claro** = `pix_auto_generate` sem uso runtime.  
5. **Retirement readiness do spine = baixa.** Readiness de **inventário/limpeza futura de rollout** = média (classificação existe; execução fora do escopo desta auditoria).

---

## Fontes

- `AUDIT_BILLING_PIPELINE_OWNERSHIP_RUNTIME.md`
- `executeSaasRenewal.ts` · `collectionPolicy/hook.ts` · `execute.ts`
- `billingFeatureFlags.ts` (+ grep `isBilling2FlagEnabled`)
- `gatewayResolver.ts` · `stripeSaasSkeleton.ts`
- `BILLING2_MVP_DECLARATION.md` · closeouts S8–S11
- Scripts `packages/backend/package.json` (`billing:*`, `trial:expire`)

---

*Fim do relatório — investigation only. Sem recomendações de implementação, remoção ou refactor.*
