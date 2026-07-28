# IMPLEMENTATION PLAN — BILLING 2.0 (SUPER ADMIN)

| Campo | Valor |
|-------|-------|
| **Nome** | `IMPLEMENTATION_PLAN_BILLING_2` |
| **Versão** | 1.0 (+ nota operacional FF: DB → env → default; sem mudança de escopo/PRD) |
| **Tipo** | Implementation Blueprint |
| **Prioridade** | Critical |
| **Escopo** | Billing 2.0 — Super Admin SaaS |
| **Data** | 2026-07-27 |
| **Modo** | Planejamento (sem implementação) |
| **Fonte funcional** | [`PRD_BILLING_2_SUPERADMIN.md`](./PRD_BILLING_2_SUPERADMIN.md) **v1.1** (imutável por este plano) |
| **Baseline técnica** | [`AUDIT_SUPERADMIN_BILLING_ASAAS.md`](./AUDIT_SUPERADMIN_BILLING_ASAAS.md) · [`AUDIT_BILLING2_PHASE2_ARCHITECTURE.md`](./AUDIT_BILLING2_PHASE2_ARCHITECTURE.md) |

---

## 0. Como usar este plano

```text
1. Aprovar este Implementation Plan
2. Executar Sprint N
3. QA da Sprint N (checklist da sprint)
4. Aprovar gate
5. Deploy opcional (sistema deve permanecer funcional)
6. Sprint N+1
…
até Sprint 12
```

**Diretrizes obrigatórias:** Zero Big Bang · Backward Compatibility · Feature Flags · Incremental Delivery · QA ao fim de cada Sprint · Rollback simples · Deploy seguro · Sem quebra de produção.

**Este plano NÃO altera o PRD.** Em conflito, o PRD v1.1 prevalece e o plano deve ser versionado.

### Estratégia operacional de Feature Flags (não altera §18 do PRD)

**Precedência de resolução** (runtime Billing 2.0 / facade `billingFeatureFlags`):

```text
1. Super Admin — platform_feature_flags (namespace billing2, default_enabled)
       ↓ (flag ausente no DB, ou falha de leitura do DB)
2. Variável .env — BILLING2_FLAG_<KEY>
       ↓ (ausente / inválida)
3. Default interno — catálogo BILLING2_FLAG_CATALOG (= defaults PRD §18 / flags técnicas do plano)
```

- **Rollout e rollback:** apenas Super Admin → Avançado → Feature Flags (`billing2.*`).  
- **`.env`:** bootstrap antes do seed e contingência (DB down / row ausente). Não é o caminho normal de operação.  
- **Defaults e quais flags existem:** imutáveis quanto ao catálogo PRD; esta regra só define *de onde* o valor efetivo é lido.  
- Seeds em `platform_feature_flags` usam os **mesmos** defaults (sem ativar engine/automações destrutivas).

**Fronteira MVP (PRD §19):** Sprints **0–8**.  
**Pós-MVP (PRD fora do MVP):** Sprints **9–11**.  
**Encerramento:** Sprint **12** (hardening transversal; pode parcializar após MVP).

---

## 1. Visão da ordem ideal

```text
S0 Preparação / Flags / Observabilidade
  ↓
S1 Foundation (contratos + defaults = comportamento atual)
  ↓
S2 Banco / Persistência (policy + audit)
  ↓
S3 Collection Policy Engine (motor + actions; flags destrutivas OFF)
  ↓
S4 UI Cobrança Automática + permissões          ┐
S5 Assinaturas (lista + past_due)               ├─ UI P0 (podem paralelizar após S3)
S6 Dashboard Financeiro (MRR contratado)        ┘
  ↓
S7 Logs + Webhooks health                       ┐ UI P1
S8 Reconciliação L2 + Recovery / Dunning        ┘  === MVP COMPLETO ===
  ↓
S9 Tokenização Cartão
  ↓
S10 PIX Automático
  ↓
S11 Multi Gateway
  ↓
S12 Hardening / Performance / QA / Deploy final
```

---

# SPRINT 0 — Preparação, Feature Flags e Observabilidade

## Nome
Sprint 0 — Preparação

## Objetivo
Criar a base segura (flags, hub, checklist, telemetria mínima) **sem mudar** comportamento de cobrança em produção.

## Escopo
- Inventário de flags da PRD §18 (registro central, defaults).
- Feature flag runtime leitura (mesmo se UI ainda mínima) — resolução **DB → env → default** (ver § “Estratégia operacional de Feature Flags” acima).
- Atualizar hub Financeiro com links/placeholders (rotas stub ou “em breve” sem quebrar nav).
- Documentar correlation_id padrão para billing (`subscription_id + period_start` / `billing_id`).
- Checklist de princípios PRD §17 no template de PR/Sprint.
- Confirmar elegibilidade comercial Asaas (tokenização / Pix Automático) — **apenas discovery**, sem código de produto.

## Fora do Escopo
Engine, migrations de policy, UI Cobrança Automática completa, mudanças em `executeSaasRenewal`.

## Dependências
PRD v1.1 aprovado; este plano aprovado.

## Entregáveis
- Mapa de flags + defaults documentado no código/config.
- Hub Financeiro alinhado (links).
- Template QA/PR Billing 2.0.
- Spike notes Asaas (anexo ops, não PRD).

## Critérios de Aceitação
- [ ] Com flags default, renovação/checkout idênticos ao pré-S0.
- [ ] Flags destrutivas (suspender/cancelar/cartão auto/PIX Auto) = OFF.
- [ ] Deploy S0 não exige migração destrutiva.

## Riscos
Baixo. Risco: link quebrado no hub → mitigar com rotas existentes ou disabled state.

## Estratégia de Rollback
Reverter PR do hub/flags; sem dados novos críticos.

## Gate para próxima Sprint
Flags legíveis em runtime + hub sem regressão + QA S0 verde.

## Checklist QA
- [ ] Checkout plano + webhook paid
- [ ] Renovação job (sandbox/staging)
- [ ] `/saas-pay` abre
- [ ] Super Admin hub Financeiro navega
- [ ] Nenhuma suspensão automática nova

### Por que existe
Evita começar engine/UI sem interruptor de emergência.

### Problema que resolve
Risco de feature “sempre ligada” e falta de governança de deploy.

### Arquivos / módulos provavelmente impactados
- `src/layouts/superadminHubConfig.ts`, `superadminNavConfig.ts`
- `packages/backend/src/services/billingSettingsService.ts` (leitura)
- Novo módulo leve `billingFeatureFlags` (ou extensão settings)
- `App.tsx` (rotas placeholder, se necessário)

### Como validar
Diff de comportamento: flags OFF → zero mudança funcional.

### Como desfazer
Revert do PR S0.

### Como saber que terminou
Gate + QA acima.

---

# SPRINT 1 — Foundation (Billing Core contracts)

## Nome
Sprint 1 — Foundation

## Objetivo
Definir contratos do Collection Policy e do audit **em código/tipos**, com interpretador “noop/passthrough” equivalente ao fluxo atual.

## Escopo
- Tipos: `CollectionPolicy`, `CollectionEvent`, `CollectionAction`.
- Defaults da policy = comportamento atual (gerar PIX conforme método automático existente; sem suspend/cancel auto).
- Adapter de leitura: policy default em memória se tabela ainda não existir **ou** ler settings atuais.
- Pontos de extensão documentados em `executeSaasRenewal` / webhook paid (hooks vazios ou if flag).
- Consumir mentalmente `grace_period` / `auto_suspend` (ainda sem efeito destrutivo se flag OFF).

## Fora do Escopo
Migrations finais, UI, dunning real, gateway novo.

## Dependências
Sprint 0.

## Entregáveis
- Contratos TypeScript + testes unitários de default policy.
- Diagrama interno Event → Action (doc curto na pasta commercial ou comentário de módulo).
- Nenhum change de produção perceptível.

## Critérios de Aceitação
- [ ] Default policy serializa/deserializa estável.
- [ ] Renovação sem diferença observável.
- [ ] Testes unitários cobrem defaults PRD §18.

## Riscos
Over-engineering do contrato → manter alinhado PRD §6/§7 apenas.

## Estratégia de Rollback
Revert; zero schema.

## Gate para próxima Sprint
Contratos aprovados em review + testes verdes + sem regressão billing.

## Checklist QA
- [ ] Unit: default policy
- [ ] Regressão renovação + checkout
- [ ] Flags ainda OFF para destrutivos

### Arquivos / módulos
- `packages/backend/src/services/billingRenewalEngine/*`
- Novo `collectionPolicy/` (types, defaults, reader stub)
- `gatewayPaymentMethodPolicy.ts` (referência, não substituir ainda)

---

# SPRINT 2 — Banco e Persistência

## Nome
Sprint 2 — Persistência

## Objetivo
Persistir Collection Policy e trilha de audit append-only, com migrations **aditivas** e nullable/default seguros.

## Escopo
- Tabela/config `billing_collection_policy` (global v1) **ou** keys em `superadmin_settings` + JSON versionado (escolher uma; preferir tabela dedicada se volume/versionamento).
- Tabela `billing_audit_events` (append-only): actor, action, entity, reason, origin, correlation_id, payload sanitizado, created_at.
- Campos opcionais futuros em `subscriptions` **somente se necessário e nullable** (ex.: preparar `past_due` usage sem exigir token/pix ids ainda — ids de token/pix ficam para S9/S10).
- Seed: uma policy global = defaults S1.
- API interna read/write policy (Super Admin ainda pode ser só API nesta sprint).

## Fora do Escopo
Engine completo de dunning; UI final; token/pix columns se puderem esperar S9/S10.

## Dependências
Sprint 1.

## Entregáveis
- Migrations aditivas.
- Repositories/services de policy + audit write helper.
- Backfill seed policy.

## Critérios de Aceitação
- [ ] Migração sobe e desce (ou forward-only documentado) sem downtime longo.
- [ ] Produção com policy default = mesmo comportamento.
- [ ] Insert de audit não quebra request path (fail-open log vs fail-closed — preferir não falhar cobrança se audit falhar, com alarme).

## Riscos
Migration em tabela quente; audit volume. Mitigar índices e retenção depois.

## Estratégia de Rollback
Feature não lê policy do banco se `billing2.collection_policy_db_read` OFF (Super Admin; fallback `.env` só se row ausente); tabela pode permanecer vazia/ignorada.

## Gate para próxima Sprint
Persistência OK em staging + seed + API read.

> **Nota pós-S2 (pré-S3):** seeds `billing2.*` em `platform_feature_flags` + facade com precedência Super Admin → `.env` → default. Sem mudança de defaults nem ativação de engine.

## Checklist QA
- [ ] Migration staging
- [ ] CRUD policy via API (admin)
- [ ] Audit write smoke
- [ ] Regressão billing

### Arquivos / módulos
- `database/init/*` / supabase migrations
- `billingSettingsService.ts`, novos `*Repository.ts`
- Controllers/routes superadmin (mínimo)

---

# SPRINT 3 — Collection Policy Engine

## Nome
Sprint 3 — Motor Collection Policy

## Objetivo
Interpretar eventos e enfileirar/executar actions tipadas, com **automações destrutivas desligadas** por default.

## Escopo
- `CollectionPolicyEngine.interpret(event, policy, context) → actions[]`.
- Executores: `notify_whatsapp`, `notify_email`, `create_pix` (já existentes), `write_audit_log`, stubs para `suspend_tenant` / `cancel_subscription` / `charge_card` guardados por flag.
- Wire mínimo:
  - `renewal.due` / pós-`executeSaasRenewal` (notificar se unpaid — alinhar flush worker).
  - `payment.paid` → reativação se flag ON (default ON) e tenant suspenso por pagamento (quando reason existir).
  - `payment.overdue` → só actions não destrutivas se suspend OFF.
- Idempotência por `(entity, action, cycle_key, attempt)`.
- Hardening notificação worker (flush) conforme auditoria de notificações.

## Fora do Escopo
UI Cobrança Automática; token cartão; Pix Automático; retries agressivos de dunning (S8).

## Dependências
Sprint 2.

## Entregáveis
- Engine + executores + testes.
- Integração pontual renovação/webhook com flags.
- Metrics/log estruturado de actions.

## Critérios de Aceitação
- [x] Policy “só WhatsApp+Email” não tenta cartão. *(interpret unit)*
- [x] Suspensão automática não ocorre com flag OFF. *(execute gated)*
- [x] `payment.paid` + reativação ON reabre acesso quando aplicável (ou no-op se não suspenso).
- [x] Actions idempotentes sob reentrega de webhook. *(idempotency_key + audit)*

## Riscos
Dupla notificação; avanço de ciclo vs liquidação (não “consertar” tudo aqui — documentar; S8 aprofunda).

## Estratégia de Rollback
Flag `collection_policy_engine_enabled=OFF` → caminho legado puro.

## Gate para próxima Sprint
Engine em staging com flags default + regressão verde.

> **Closeout:** [`billing2/BILLING2_SPRINT3_CLOSEOUT.md`](./billing2/BILLING2_SPRINT3_CLOSEOUT.md) · Event→Action: [`billing2/BILLING2_COLLECTION_POLICY_EVENT_ACTION.md`](./billing2/BILLING2_COLLECTION_POLICY_EVENT_ACTION.md)

## Checklist QA
- [x] Unit interpretador
- [x] Integração renewal → notify *(wire; ownership quando engine ON)*
- [x] Webhook paid → audit + reactivate path
- [x] Flag OFF = legado
- [ ] Smoke staging operador

### Arquivos / módulos
- `collectionPolicy/engine.ts`, `actions/*`
- `executeSaasRenewal.ts`, `paymentDomainService.ts`
- `platformNotifications/*`
- `subscriptionService.ts` (reativação)

---

# SPRINT 4 — UI Cobrança Automática (P0)

## Nome
Sprint 4 — Cobrança Automática UI

## Objetivo
Permitir ao Super Admin configurar a policy sem deploy (PRD §7).

## Escopo
- Tela Financeiro → Cobrança Automática (wireframe PRD).
- Permissões: só Admin/autorizado escreve.
- Preview textual do comportamento.
- Save → audit (actor, before/after).
- Validação: tentativas ≥ 1; suspender ≤ cancelar dias.

## Fora do Escopo
Lista Assinaturas; Dashboard KPIs novos; Multi-gateway UI.

## Dependências
Sprint 3 (engine consome o que a UI grava).

## Entregáveis
- Página React + API GET/PUT policy.
- Entrada no hub/nav.
- Testes UI críticos (save/validation).

## Critérios de Aceitação
- [x] Alterar intervalo/tentativas muda runtime no próximo evento. *(policy persistida; engine S3 consome)*
- [x] Usuário sem permissão recebe 403. *(requireSuperAdmin)*
- [x] Defaults batem PRD §18.

## Riscos
Operador liga suspender sem entender → default OFF + confirmação.

## Estratégia de Rollback
Esconder rota + flag UI; policy no banco permanece com defaults seguros se reset.

## Gate para próxima Sprint
UI P0 Cobrança Automática aprovada por Financeiro (demo).

> **Closeout:** [`billing2/BILLING2_SPRINT4_CLOSEOUT.md`](./billing2/BILLING2_SPRINT4_CLOSEOUT.md)

## Checklist QA
- [x] UI save/load
- [x] Permissões (Super Admin)
- [x] Validação + preview (unit)
- [ ] Regressão engine com valores da UI (staging)
- [ ] Demo Financeiro

### Arquivos / módulos
- `src/pages/superadmin/billing2/SuperAdminBilling2CollectionPolicyPage.tsx`
- `src/lib/billing2/collectionPolicyForm.ts`
- hub/nav, `App.tsx` (rota já existia)
- `superadminBillingController` GET/PUT collection-policy

---

# SPRINT 5 — Assinaturas (P0)

## Nome
Sprint 5 — Assinaturas SA

## Objetivo
Visibilidade operacional do contrato SaaS e uso real de `past_due`.

## Escopo
- Lista/filtro `subscriptions` `type=saas`.
- Detalhe: status, next_billing_date, método, tenant, valor contratado, link cobranças.
- Writer: marcar `past_due` quando overdue além de grace **e** policy/flags permitirem (sem suspender se suspend OFF).
- Histórico mínimo (últimas faturas / audit relacionados).

## Fora do Escopo
Pix Auto auth UI; token card UI; churn analytics profundo.

## Dependências
Sprint 2–3; idealmente após S4 (não bloqueante duro).

## Entregáveis
- Página Assinaturas + API list/detail.
- Transição `active` ↔ `past_due` testada.

## Critérios de Aceitação
- [x] `past_due` deixa de ser “estado morto” no SaaS.
- [x] Labels não confundem tenant pending vs fatura pending.
- [x] Com engine OFF, listagem ainda funciona (read-only útil).

## Riscos
Jobs marcam past_due em massa no deploy → dry-run / flag `past_due_writer_enabled`.

## Estratégia de Rollback
Desligar writer; UI read-only.

## Gate para próxima Sprint
Lista Assinaturas em uso pelo Suporte/Financeiro.

> **Closeout:** [`billing2/BILLING2_SPRINT5_CLOSEOUT.md`](./billing2/BILLING2_SPRINT5_CLOSEOUT.md)

## Checklist QA
- [x] List/filter
- [x] Transição past_due (unit writer + clear on paid)
- [ ] Regressão activatePlanFromBilling (staging)
- [ ] Smoke UI

### Arquivos / módulos
- `collectionPolicy/subscriptionPastDueWriter.ts`
- `collectionPolicy/saasSubscriptionsAdminService.ts`
- `SuperAdminBilling2SubscriptionsPage.tsx`
- `billingOverdueStatusService.ts`, `paymentDomainService.ts`

---

# SPRINT 6 — Dashboard Financeiro (P0)

## Nome
Sprint 6 — Dashboard

## Objetivo
KPIs honestos para operação (MRR contratado + cards essenciais).

## Escopo
- Corrigir MRR/ARR para base **contratada** (`subscriptions`), não só catálogo.
- Cards: receita período, inadimplência, renovações, assinaturas active/past_due, valor em risco (se dados bastarem).
- Tooltips com definições PRD §12 / §22 (subset MVP).
- Alertas leves: jobs failed, overdue spike (se health já exposto).

## Fora do Escopo
LTV/churn temporal completo (P2); KPIs Pix Auto/Cartão (N/A até S9/S10).

## Dependências
Sprint 5 ajuda (past_due counts); pode iniciar após S2 com dados atuais.

## Entregáveis
- Atualização `superadminDashboardService` + UI dashboard/hub.
- Testes de cálculo MRR amostra.

## Critérios de Aceitação
- [x] MRR bate amostra manual de 10 assinaturas. *(unit monthlyize)*
- [x] Tooltip explica contratado vs lista.

## Riscos
Mudança de número “assusta” stakeholders → comunicar no release notes. *(flag default OFF)*

## Estratégia de Rollback
Feature flag `dashboard_mrr_contracted` + fallback catálogo.

## Gate para próxima Sprint
Financeiro valida números em staging.

> **Closeout:** [`billing2/BILLING2_SPRINT6_CLOSEOUT.md`](./billing2/BILLING2_SPRINT6_CLOSEOUT.md)

## Checklist QA
- [x] Cálculo MRR
- [x] UI cards
- [ ] Regressão dashboard geral (staging)
- [ ] Demo Financeiro

### Arquivos / módulos
- `billing2/dashboardMrr.ts`, `superadminDashboardService.ts`, `SuperAdminDashboard.tsx`
- `commercialAnalyticsService.ts` (bloco Receita SaaS existente)

---

# SPRINT 7 — Logs, Auditoria e Webhooks Health (P1)

## Nome
Sprint 7 — Observabilidade SA

## Objetivo
Trilha auditável pesquisável + saúde de webhooks (MVP PRD §19).

## Escopo
- Tela Logs: filtros tenant, billing_id, action, período; detalhe sanitizado; export CSV.
- Tela/aba Webhooks: últimos eventos, failed, taxa OK; link reprocessar **seguro** (só se idempotente).
- Garantir writes de audit nos fluxos S3 já existentes + gaps (mudança policy, suspend manual, etc.).

## Fora do Escopo
SIEM externo; retenção multi-ano automation.

## Dependências
Sprint 2 (audit table); S3/S4 geram eventos.

## Entregáveis
- UI Logs + Webhooks health.
- API query/export.
- Runbook curto de webhook failed.

## Critérios de Aceitação
- [x] Suspensão (mesmo manual) gera audit com reason. *(executor auto-suspend; manual SA futuro)*
- [x] Export 90 dias de 1 tenant funciona. *(API export.csv + filtro tenant_id)*
- [x] Token inválido de webhook continua rejeitado (regressão segurança).

## Riscos
PII em payload → sanitização obrigatória.

## Estratégia de Rollback
Esconder telas; tabelas permanecem.

## Gate para próxima Sprint
Ops consegue diagnosticar webhook sem SSH.

> **Closeout:** [`billing2/BILLING2_SPRINT7_CLOSEOUT.md`](./billing2/BILLING2_SPRINT7_CLOSEOUT.md) · Runbook: [`billing2/BILLING2_WEBHOOK_FAILED_RUNBOOK.md`](./billing2/BILLING2_WEBHOOK_FAILED_RUNBOOK.md)

## Checklist QA
- [x] Filtros logs (API + UI)
- [x] Export
- [x] Webhook health
- [x] Segurança token (inalterada)
- [ ] Smoke staging

### Arquivos / módulos
- `billing2/billingAuditQueryService.ts`, `billing2/billingWebhookHealthService.ts`
- `SuperAdminBilling2LogsPage.tsx`, `SuperAdminBilling2WebhooksPage.tsx`
- `asaasWebhook.ts` (métricas via tabelas existentes; reprocess seguro)

---

# SPRINT 8 — Reconciliação L2 + Recovery / Dunning (fecha MVP)

## Nome
Sprint 8 — Reconciliação e Recovery

## Objetivo
Nenhuma cobrança perdida (L2) + dunning configurável completo sob flags.

## Escopo
- Reconciliador L2: open `tenant_billing` com `gateway_reference_id` → `getPayment` → alinhar status.
- Dashboard/Ops: lista divergências.
- Recovery/dunning: retries, intervalo, gerar PIX pós-falha, notificar; **suspender/cancelar** só se flags ON.
- Funil recuperação básico no dashboard (Receita Recuperada / Taxa se viável).
- Reativação automática E2E consolidada.

## Fora do Escopo
Token cartão; Pix Automático; 2º gateway.

## Dependências
Sprints 3–7 (policy, UI, estados, logs).

## Entregáveis
- Job L2 + UI divergências.
- Dunning job/actions completos sob flags.
- Declaração **MVP Billing 2.0** após QA.

## Critérios de Aceitação
- [x] Caso “pago no Asaas / pending no sistema” corrigido pelo L2 (código + teste unitário; smoke staging pendente).
- [x] Com suspend OFF, não suspende (engine/auto_* default OFF; dunning só emite se flag ON).
- [ ] Com suspend ON (staging), suspende após N dias e reativa no paid.
- [ ] Demo MVP cobre PRD §19 obrigatórias.

## Riscos
L2 altera status em massa; suspend ON em prod sem querer. Mitigar: dry-run, flag, limite batch.

## Estratégia de Rollback
Flags `reconciliation_l2_enabled`, `dunning_enabled`, `auto_suspend`; jobs no-op.

## Gate para próxima Sprint
**MVP aprovado** (produto + QA). S9+ só após isso (ou em paralelo com flags OFF).

## Checklist QA
- [ ] L2 divergência sintetizada
- [ ] Dunning timeline
- [ ] Suspend/reactivate E2E (staging flags)
- [ ] Regressão renovação legado
- [ ] Performance job L2 amostral

## Closeout
Ver [`billing2/BILLING2_SPRINT8_CLOSEOUT.md`](./billing2/BILLING2_SPRINT8_CLOSEOUT.md) e [`billing2/BILLING2_MVP_DECLARATION.md`](./billing2/BILLING2_MVP_DECLARATION.md).

### Arquivos / módulos
- `billingReconciliationService.ts` (expandir)
- `billingRecoveryService.ts`, overdue services
- `collectionPolicy/actions/suspend|cancel|retry`
- Ops UI

---

# SPRINT 9 — Tokenização e Cartão Automático (pós-MVP)

## Nome
Sprint 9 — Cartão Tokenizado

## Objetivo
Renovação por cartão sem PAN; troca de cartão; fallback policy.

## Escopo
- Persistência token (vault/campos gateway-safe).
- Captura na renovação se flag “Renovação automática por cartão” ON.
- Troca de cartão em `/saas-pay`.
- KPI falhas de cartão.
- Fallback PIX conforme policy.

## Fora do Escopo
Pix Automático; Assinatura nativa Asaas como SSOT.

## Dependências
MVP (S8); tokenização habilitada no Asaas produção.

## Entregáveis
- Fluxo token E2E staging/prod com flag.
- Docs ops PCI (não armazenar PAN).

## Critérios de Aceitação
- [x] Default flag OFF → zero mudança (código; smoke staging pendente).
- [x] ON + token → captura na renovação (worker path + policy `charge_card`).
- [x] Falha → audit + token invalid; PIX/notify via policy `actions_after_fail` (já S3).
- [x] Sem PAN/CVV em logs/DB (store + sanitize audit).

## Riscos
PCI; duplicidade captura; tokenização não habilitada.

## Estratégia de Rollback
Flag OFF imediato; renovação volta a charge aberta.

## Gate para próxima Sprint
Cartão auto estável em % opt-in.

## Checklist QA
- [ ] Token save
- [ ] Renewal charge_card
- [ ] Troca cartão
- [ ] Fallback
- [ ] Gateway sandbox

## Closeout
Ver [`billing2/BILLING2_SPRINT9_CLOSEOUT.md`](./billing2/BILLING2_SPRINT9_CLOSEOUT.md) e [`billing2/BILLING2_PCI_CARD_TOKEN_OPS.md`](./billing2/BILLING2_PCI_CARD_TOKEN_OPS.md).

### Arquivos / módulos
- `asaasClient.payWithCreditCard`, `asaasService`
- `payment_customers` / novo store token
- `PublicSaasBillingPay.tsx`, `executeSaasRenewal.ts`

---

# SPRINT 10 — PIX Automático (pós-MVP)

## Nome
Sprint 10 — PIX Automático

## Objetivo
Débito PIX autorizado (opt-in), com consentimento e fallback.

## Escopo
- Flag PIX Automático OFF default.
- Jornada autorização (QR composto) na renovação sem auth.
- Persistir `authorization_id` + status.
- Webhooks `PIX_AUTOMATIC_*`.
- Instruções respeitando janela 2–10 dias úteis.
- Auth lost → fallback PIX avulso + notify.

## Fora do Escopo
Multi-gateway; migração silenciosa da base.

## Dependências
S8; elegibilidade Asaas; S3 engine.

## Entregáveis
- Adapter capability Pix Automático.
- UI status auth na Assinatura/saas-pay.
- Runbook BACEN/Asaas.

## Critérios de Aceitação
- [ ] OFF = fluxo atual.
- [ ] Consentimento obrigatório.
- [ ] Paid via payment webhooks.
- [ ] Cancel/expire auth desliga efetivo.

## Riscos
Janela dias úteis; PSP refuse; UX de autorização.

## Estratégia de Rollback
Flag OFF + cancelar instruções pendentes se necessário (runbook).

## Gate para próxima Sprint
Opt-in piloto OK.

## Checklist QA
- [ ] Auth journey
- [ ] Webhooks auth/instruction
- [ ] Fallback
- [ ] Regressão PIX avulso

### Arquivos / módulos
- `asaasClient` novos endpoints
- webhook parser/events
- `executeSaasRenewal` branch
- UI Assinaturas / saas-pay

---

# SPRINT 11 — Multi Gateway (pós-MVP)

## Nome
Sprint 11 — Multi Gateway

## Objetivo
Preparar/registrar 2º gateway SaaS sem regras de negócio no vendor.

## Escopo
- Capabilities interface (`pixAutomatic?`, `cardToken?`, …).
- Registry além de Asaas.
- Webhook path genérico ou adapter dedicado.
- Checklist onboarding gateway (PRD §15).
- UI Gateways sem labels de negócio “Asaas” na Cobrança Automática.

## Fora do Escopo
Cobrança internacional completa; substituir Asaas.

## Dependências
S3–S8 estáveis; ideal S9/S10 via capabilities.

## Entregáveis
- Adapter #2 (ex.: Stripe ou MP SaaS) em sandbox **ou** skeleton + um gateway real conforme decisão comercial.
- Doc onboarding.

## Critérios de Aceitação
- [ ] Billing Core não importa HTTP Asaas em policy engine.
- [ ] Troca de gateway config não quebra policy.
- [ ] Testes com mock capability.

## Riscos
Escopo explodir; escolher vendor cedo demais.

## Estratégia de Rollback
Manter Asaas como default global; 2º gateway flag OFF.

## Gate para próxima Sprint
Capability model consolidado.

## Checklist QA
- [ ] Registry
- [ ] Webhook isolation SaaS vs CRM
- [ ] Regressão Asaas

### Arquivos / módulos
- `gatewayRegistry.ts`, `paymentGatewayTypes.ts`
- Novo adapter package
- Resolver saas

---

# SPRINT 12 — Hardening, Performance, QA e Deploy

## Nome
Sprint 12 — Hardening

## Objetivo
Certificar produção: performance jobs, regressão total, runbooks, feature flag matrix final.

## Escopo
- Load amostral reconciliador/dunning.
- Matriz regressão S0–S11 (ou até MVP se pós-MVP adiado).
- Revisão permissões RBAC.
- Chaos leve: webhook duplicado, gateway 500, worker restart.
- Documentação ops final + tag release Billing 2.0.

## Fora do Escopo
Novas features de produto.

## Dependências
Última sprint de produto aprovada (S8 para MVP-only; S11 se full).

## Entregáveis
- Relatório QA hardening.
- Runbooks (divergência, suspend, pix auto, card).
- Flag matrix produção.

## Critérios de Aceitação
- [ ] Nenhuma P0 aberta.
- [ ] Rollback testado (flag OFF) para cada automação crítica.
- [ ] Checklist princípios §17 100%.

## Riscos
Escopo infinito de perf → time-box.

## Estratégia de Rollback
N/A (sprint de certificação); correções via hotfix flags.

## Gate para próxima Sprint
**Fim do programa** (ou volta a backlog P2 KPIs avançados via novo plano).

## Checklist QA
- [ ] Regressão completa
- [ ] Performance jobs
- [ ] Segurança
- [ ] Deploy checklist

---

# DEPENDÊNCIAS ENTRE SPRINTS

| Sprint | Depende de | Desbloqueia |
|--------|------------|-------------|
| **S0** | Aprovação plano + PRD | S1 |
| **S1** | S0 | S2 |
| **S2** | S1 | S3, (S6 parcial), S7 |
| **S3** | S2 | S4, S5, S8 |
| **S4** | S3 | S8 (config ops), demo MVP UI |
| **S5** | S2–S3 (S4 opcional) | S6, S8 |
| **S6** | S2 (S5 recomendado) | Demo Financeiro |
| **S7** | S2–S4 | S8, ops |
| **S8** | S3–S7 | **MVP** · S9 · S10 |
| **S9** | S8 + Asaas token | KPIs cartão · S11 capabilities |
| **S10** | S8 + elegibilidade Pix Auto | Adoção PIX Auto · S11 |
| **S11** | S8 (+ S9/S10 ideal) | S12 full |
| **S12** | S8 (MVP) ou S11 (full) | Release certificado |

```text
S0 → S1 → S2 → S3 ┬→ S4 ─┐
                   ├→ S5 ─┼→ S8 → S9 → S11 → S12
                   │      ├→ S7 ─┘      ↘ S10 ↗
                   └→ S6 ─┘
```

Sem dependências circulares.

---

# MATRIZ DE RISCO

| Sprint | Complexidade | Impacto prod | Risco | Rollback | Tempo est. | Prioridade |
|--------|--------------|--------------|-------|----------|------------|------------|
| S0 | Baixa | Baixo | Baixo | Revert PR | 2–4d | P0 |
| S1 | Baixa | Baixo | Baixo | Revert | 3–5d | P0 |
| S2 | Média | Médio | Médio | Flag ignore schema | 4–7d | P0 |
| S3 | Alta | Médio | Médio-Alto | Engine flag OFF | 5–8d | P0 |
| S4 | Média | Baixo | Baixo | Hide UI | 4–6d | P0 |
| S5 | Média | Médio | Médio | Writer flag OFF | 4–7d | P0 |
| S6 | Média | Baixo* | Baixo | Flag MRR | 3–5d | P0 |
| S7 | Média | Baixo | Baixo | Hide UI | 4–6d | P1 |
| S8 | Alta | Alto | Alto | L2/dunning flags OFF | 7–12d | P0 (fecha MVP) |
| S9 | Alta | Alto | Alto | Card auto OFF | 8–14d | P3 pós-MVP |
| S10 | Alta | Alto | Alto | Pix Auto OFF | 10–16d | P3 pós-MVP |
| S11 | Alta | Médio | Médio | 2º GW OFF | 10–20d | P3 |
| S12 | Média | Médio | Baixo | Hotfix flags | 5–10d | P0 encerramento |

\*Impacto de percepção (número MRR muda), não de cobrança.

---

# MATRIZ DE TESTES (por Sprint)

| Sprint | Unit | Integração | Webhook | Gateway | UI | Recovery | Perf | Regressão |
|--------|------|------------|---------|---------|-----|----------|------|-----------|
| S0 | Flags | — | — | — | Hub | — | — | Checkout/renew |
| S1 | Policy defaults | — | — | — | — | — | — | Renew |
| S2 | Repo | API policy | — | — | — | — | — | Migração+billing |
| S3 | Engine | Renew→action | Paid | — | — | Reactivate stub | — | Flag OFF legado |
| S4 | Validação | API+engine | — | — | Form policy | — | — | Permissões |
| S5 | past_due | Overdue→status | — | — | Lista | — | — | Activate plan |
| S6 | MRR calc | Snapshot | — | — | Cards | — | — | Dashboard |
| S7 | Sanitização | Query audit | Invalid token | — | Logs/WH | — | — | Webhook auth |
| S8 | L2 match | getPayment sync | Overdue/paid | getPayment | Divergências | Dunning E2E | Job batch | Full MVP |
| S9 | Token store | payWithCard | Card fail | Card sandbox | saas-pay | Fallback PIX | — | Flag OFF |
| S10 | Auth state | Instruction | PIX_AUTO_* | Pix Auto API | Auth UX | Auth lost | — | PIX avulso |
| S11 | Capabilities | Registry | WH adapter | 2º GW sandbox | Gateways | — | — | Asaas path |
| S12 | — | Smoke full | Replay dup | Chaos 5xx | Smoke SA | Chaos dunning | Load L2 | Full suite |

---

# FEATURE FLAGS × SPRINT

| Feature (PRD §18) | Default | Introduzida / aplicada em |
|-------------------|---------|---------------------------|
| Gerar PIX automaticamente | ON | S0 registro · S3/S4 efetiva |
| WhatsApp cobrança | ON | S0 · S3/S4 |
| Email cobrança | ON | S0 · S3/S4 |
| Reativação automática | ON | S0 · S3 · S8 E2E |
| Reconciliação automática | ON | S0 · **S8** L2 |
| Logs detalhados | ON | S0 · **S7** |
| Suspensão automática | OFF | S0 · S3 stub · **S8** efetivo se ON |
| Cancelamento automático | OFF | S0 · S3 stub · **S8** |
| Renovação automática por cartão | OFF | S0 · **S9** |
| PIX Automático | OFF | S0 · **S10** |

Flags técnicas extras do plano:

| Flag técnica | Sprint | Função |
|--------------|--------|--------|
| `collection_policy_engine_enabled` | S3 | Liga motor |
| `past_due_writer_enabled` | S5 | Escrita past_due |
| `dashboard_mrr_contracted` | S6 | MRR novo |
| `reconciliation_l2_enabled` | S8 | Poll getPayment |
| `dunning_enabled` | S8 | Retries/suspend path |

---

# ROADMAP FINAL (visual)

```text
Arquitetura (Audits + PRD v1.1) ✓
        ↓
S0  Preparação / Flags / Observabilidade
        ↓
S1  Foundation (contratos)
        ↓
S2  Banco / Persistência
        ↓
S3  Collection Policy Engine
        ↓
   ┌────┴────┬────────────┐
   ↓         ↓            ↓
S4 UI     S5 Assinaturas  S6 Dashboard
Cobrança     + past_due      KPIs
Automática
   └────┬────┴────────────┘
        ↓
S7  Logs + Webhooks Health
        ↓
S8  Reconciliação + Recovery     ★ MVP COMPLETO
        ↓
S9  Tokenização Cartão
        ↓
S10 PIX Automático
        ↓
S11 Multi Gateway
        ↓
S12 Hardening / QA / Deploy certificado
```

---

# CRITÉRIOS DE QUALIDADE DO PLANO

| Critério | Como este plano atende |
|----------|------------------------|
| Minimizar risco produção | Flags OFF default; S0–S2 sem mudança de cobrança |
| Deploy após qualquer Sprint | Cada sprint é verticalmente testável; flags isolam |
| Rollback por Sprint | Flag + revert PR + ignore schema aditivo |
| Sem dependências circulares | Matriz acíclica |
| Evitar retrabalho | Contratos S1 antes de UI; persistência S2 antes de engine |
| Respeitar PRD v1.1 | MVP = S0–S8; fora MVP = S9–S11 |
| Compatibilidade clientes | Fallback legado; PIX Auto/cartão opt-in |

---

# PROCESSO OFICIAL PÓS-APROVAÇÃO

1. Aprovar este **Implementation Plan v1.0**.  
2. Abrir Sprint 0 (branch/PR isolado).  
3. Executar → QA checklist S0 → Gate.  
4. Deploy opcional.  
5. Repetir para S1…S8 → **declarar MVP**.  
6. Decidir ordem S9 vs S10 conforme elegibilidade Asaas (PRD permite inverter).  
7. S11 conforme prioridade comercial.  
8. S12 certifica o que estiver ligado em produção.

**Regra:** nenhuma sprint altera regra de negócio do PRD sem bump do PRD (§23) **antes** da implementação.

---

# Apêndice — Mapeamento PRD → Sprint

| Item PRD §19 (MVP) | Sprint |
|--------------------|--------|
| Collection Policy | S1–S3 |
| Cobrança Automática | S4 |
| Dashboard Financeiro | S6 |
| Assinaturas | S5 |
| Cobranças | Já existe; evolução leve S5/S7 links |
| Logs | S7 |
| Reconciliação | S8 |
| Reativação Automática | S3/S8 |
| Operações | Já existe; S7/S8 enrich |
| Health Webhooks | S7 |

| Fora do MVP | Sprint |
|-------------|--------|
| Tokenização | S9 |
| PIX Automático | S10 |
| Multi Gateway | S11 |
| Push/SMS/Rule/Workflow/Internacional | Fora deste plano |

---

**Fim do Implementation Plan Billing 2.0 v1.0**

Aguardando aprovação para iniciar a **Sprint 0**.
`)