# Plano mestre — fluxo de contratação e novas empresas (PainelCRM)

**Escopo:** arquitetura e regras **encontradas no código** (referência em mar/2026).  
**Esta etapa:** somente documentação e proposta — **sem implementação**.

---

## 1. Resumo executivo

O PainelCRM combina **várias origens** para criação de `tenants` e do **primeiro administrador**: contratação com cobrança (`POST /api/plan-purchase`), cadastro com trial por plano “grátis” (`POST /api/auth/register`, `POST /api/auth/register/organization`) e criação manual por API interna (`POST` em rotas que usam `tenantsController.createTenant`). A **ativação pós-pagamento** do fluxo SaaS é centralizada em `activatePlanFromBilling` (webhook Asaas, polling em `GET /api/billing/:id/status`, ou ambos). A **recorrência** pós-primeira ativação é tratada pelo **Billing Engine** (`enqueueRenewalJobs` / `processNextBatch` em scripts agendáveis), não pelo checkout em si.

O **trial por dias** (`trial_ends_at`) é gravado quando o plano tem `is_free = true` e `free_access_days` nos fluxos de registro **sem** `plan-purchase`; já o **checkout pago** cria tenant em `payment_pending`, gera `tenant_billing` pendente e **não** usa `is_free` no mesmo fluxo (`validatePlanForPurchase` impede compra de plano gratuito com cobrança).

**Conclusão:** para “fechar” o ciclo comercial de forma única e previsível, será necessário **decidir politicamente** o papel do trial gratuito, do `/register` legado e do **momento exato** de criação de tenant/admin; o código atual **suporta** várias combinações, o que gera **sobreposição e inconsistência de UX**.

---

## 2. Fluxo atual real encontrado no sistema

### 2.1 Configuração e leitura de planos

| Aspecto | Onde |
|--------|------|
| **CRUD / campos** | `packages/backend/src/controllers/plansController.ts` — criação/atualização com Zod; campos incluem `billing_interval`, `max_users`, `plan_type` (`standard` \| `custom`), `is_default`, `is_free`, `free_access_days`, `benefits`, etc. |
| **Listagem pública** | Tipicamente `GET /api/plans` (consumido pelo front da landing e wizard de registro). |
| **Preço custom / intervalos** | `plan_interval_prices` — usado em `billingService.calculateInvoiceAmount` para `plan_type = custom` × `users_count` × intervalo. |
| **Uso na contratação** | `billingService.validatePlanForPurchase` + `calculateInvoiceAmount`; planos `is_free` **não** passam na compra com cobrança. |

### 2.2 Seleção no site → checkout

- Landing (`Pricing.tsx`): navega para `/checkout` com `state: { plan, billingInterval, usersCount }`.
- `PlanCheckout`: se não houver plano no state, redireciona para `/landing` (comportamento atual).

### 2.3 Contratação paga (checkout)

1. **Tenant** criado em `planPurchaseController.resolveTenantId` com `status = 'payment_pending'` (se anônimo), com dados de faturamento.
2. **Admin** opcional via `createTenantAdminUser` se houver `email` (senha **placeholder**).
3. `subscribePlan` cria linha em `tenant_billing` **pending**, integra gateway (Asaas), retorna URLs/PIX.
4. **Ativação:** ao pagar → `activatePlanFromBilling` atualiza tenant para `active`, define `plan_period_start` / `plan_period_end`, `activated_billing_id`, e cria `subscriptions` tipo `saas` se ainda não existir.

### 2.4 Trial sem pagamento (fluxos legados)

- **`POST /api/auth/register`:** após criar usuário, se existir plano `is_default`/`is_active`, insere tenant com `status = 'trial'` e `trial_ends_at = now() + free_access_days` **ou** `trial` sem data conforme plano.
- **`POST /api/auth/register/organization`:** similar, com CPF/CNPJ da empresa e dados de admin completos; status `trial` e `trial_ends_at` quando `is_free` e dias configurados.

### 2.5 Pós-trial e “fim do grátis”

- **Features:** `featureFlagService` — se `status === 'trial'` e `trial_ends_at < now()`, **desliga** features (como “fim lógico” do trial).
- **`GET /api/auth/me`:** calcula `plan_expired` quando plano `is_free` e `trial_ends_at` passou (flag para o front).
- **Não foi encontrado** no código um job que **converta automaticamente** trial em cobrança ou altere status para `suspended` só pelo fim de `trial_ends_at` (a recorrência documentada no Billing Engine parte de **assinatura ativa** pós-primeiro pagamento).

### 2.6 Recorrência e cobrança após ativação

- `activatePlanFromBilling` cria `subscriptions` com `next_billing_date` alinhado ao fim do período.
- `recurringBillingJobService.enqueueRenewalJobs` seleciona assinaturas `active` com `next_billing_date <= CURRENT_DATE` e enfileira jobs; o **worker** gera novas faturas e cobranças.
- Scripts: `runRecurringScheduler.ts`, `runRecurringWorker.ts` (uso por cron — ver `package.json`).

### 2.7 Falha / abandono

- **Abandono no checkout:** tenant permanece `payment_pending` com fatura `pending` até `cancelExpiredPendingBillings` (padrão **48h**, configurável por env) cancelar faturas e **reverter** tenants em `payment_pending` para `status = 'trial'` (`subscriptionService.cancelExpiredPendingBillings`).
- **Incerteza:** o impacto exato em tenant que **nunca** esteve em trial e só conhece `payment_pending` precisa validação de negócio (hoje o UPDATE é só `WHERE status = 'payment_pending'`).

### 2.8 Webhooks e polling

- **Webhook:** `POST /webhooks/asaas` → `asaasWebhookHandler` → `paymentDomainService.applyPaymentEvent` → para `tenant_billing` pago chama `activatePlanFromBilling`.
- **Polling:** `GET /api/billing/:billingId/status` — se pendente, consulta gateway; se pago, atualiza fatura e chama `activatePlanFromBilling` (fallback quando webhook não chega).

### 2.9 Notificações de trial (super admin)

- `superadminNotificationsService.checkAndNotifyTrialEnding` — tenants em `trial` com `trial_ends_at` em janela futura; acionado via `POST /api/superadmin/notifications/check-trials` (não é cron interno no repo; depende de agendamento externo).

### 2.10 Onboarding pós-pagamento

- `POST /api/onboarding/create-admin` — exige tenant `active`; atualiza senha do admin criado no checkout (hash placeholder) ou cria admin em fallback.
- Fluxo de UI: `Onboarding.tsx` após redirect do checkout com `tenantId`.

### 2.11 Acesso bloqueado por plano

- `requireActivePlanPeriod` — se `plan_period_end < hoje`, responde **402** `PLAN_EXPIRED` (rotas que usam `tenantAuth`).
- **Trial expirado** é tratado principalmente via **features** e `plan_expired` em `/me`, não pelo mesmo middleware de data de período pago.

---

## 3. Mapa de criação de tenant

Todos os pontos encontrados com `INSERT INTO tenants`:

| Origem | Arquivo | Status típico | Notas |
|--------|---------|----------------|-------|
| Compra self-service | `planPurchaseController.ts` | `payment_pending` | `created_via = registration`; amarra `plan_id` inicial |
| Registro WhatsApp / e-mail | `authController.ts` (register) | `trial` (com ou sem `trial_ends_at`) | Plano default ou primeiro ativo |
| Wizard organização | `registerOrganizationController.ts` | `trial` | Transação com tenant + user admin |
| API Super Admin / gestão | `tenantsController.ts` | configurável (`active`, `trial`, etc.) | Uso administrativo |

**Não** há outro `INSERT INTO tenants` em `packages/backend/src` além dos acima (busca por grep).

---

## 4. Mapa de criação de admin (owner / primeiro usuário)

| Mecanismo | Arquivo / função | Senha |
|-----------|------------------|--------|
| Checkout | `createTenantAdminUser` (`tenantAdminService.ts`) | Placeholder até onboarding |
| Onboarding fallback | `onboardingController` + `createTenantAdminUser` | Pode criar com senha real |
| Registro site | `authController.register` | Hash real |
| Wizard `/register` | `registerOrganizationController` | Hash real |
| Convite / equipe | `myTenantPlanController` (ex.: `postMyTenantUser`) | Hash real — **membro**, não substitui o fluxo de “nova empresa” |

---

## 5. Mapa de contratação e cobrança

| Etapa | Endpoint / serviço |
|-------|-------------------|
| Iniciar compra | `POST /api/plan-purchase` |
| Gerar fatura e cobrança | `subscriptionService.subscribePlan` → `invoiceService.createInvoice` → gateway `createCharge` |
| Status / ativação | Webhook Asaas; `GET /api/billing/:id/status`; `activatePlanFromBilling` |
| Assinatura SaaS | `billingSubscriptionService.createSubscription` (após primeiro pagamento) |
| Renovação | `recurringBillingJobService` + tabelas `billing_recurring_jobs`, `subscriptions` |
| Cancelamento de pendências antigas | `cancelExpiredPendingBillings` (script `cancelExpiredBillings.ts`) |
| Reconciliação | `billingReconciliationService` + script `runReconciliation.ts` (documentado como periódico) |

**Configurações globais:** `billingSettingsService` — `grace_period_days`, `auto_suspend_enabled` (usadas na criação de assinatura; efeito completo de inadimplência depende de encadear com webhooks/worker — validar em `billingSubscriptionService` / worker ao processar falha de pagamento).

---

## 6. Mapa de trial / período grátis

| Pergunta | Resposta no código |
|----------|-------------------|
| Onde **começa**? | Ao criar tenant em fluxos com plano `is_free` e `free_access_days` → `trial_ends_at` futuro; ou `trial` sem data em alguns inserts. |
| Onde **termina** (logicamente)? | `featureFlagService` e `getEnabledFeaturesForUser` tratam `trial` com `trial_ends_at` passado como “sem acesso às features”; `getMe` expõe `plan_expired`. |
| Checkout pago usa trial do plano? | **Não** no mesmo request: `validatePlanForPurchase` bloqueia `is_free` na compra. |
| Cobrança automática ao fim do trial | **Não** encontrada como fluxo único: conversão para assinatura recorrente ocorre após **primeiro pagamento** que cria `subscriptions`. |

---

## 7. Mapa de onboarding

| Peça | Descrição |
|------|-----------|
| `POST /api/onboarding/create-admin` | Define senha definitiva quando tenant já `active`; bloqueia se ainda não pago |
| Outros endpoints onboarding | PATCH/GET tenant data no mesmo controller (completar dados empresa) |
| UI | `Onboarding.tsx` — steps com URL `?step=` |

Dependência: checkout atual pressupõe **pagamento confirmado** antes de concluir senha no onboarding.

---

## 8. Fluxos paralelos existentes

1. **Checkout `/checkout` + `plan-purchase`** — tenant `payment_pending` → pago → `active`.
2. **`/api/auth/register`** — tenant `trial` com plano default, sem cobrança imediata.
3. **`/api/auth/register/organization`** — tenant `trial`, admin completo, CPF empresa.
4. **Super Admin `tenantsController.createTenant`** — provisionamento manual.
5. **Upgrade logado** — mesmo `plan-purchase` com `req.tenantId` (não cria tenant novo).

Front paralelo: `/register`, wizard, `AuthModal` / `AuthWhatsApp` com `signUp`, `/register/steps` para completar perfil.

---

## 9. Gaps e inconsistências atuais

- **Múltiplas “portas”** com semânticas diferentes de **senha do admin** (placeholder vs imediata).
- **Trial** ligado a `is_free` em uns fluxos e **inexistente** no checkout pago; risco de expectativa de “trial com cartão” não implementado uniformemente.
- **`plan_period_end`** só é preenchido após fluxo de **ativação paga**; trial antigo pode não ter esse campo — `requireActivePlanPeriod` **ignora** se `plan_period_end` for null (acesso não bloqueado por data nesse middleware).
- **Duplicidade de identidade:** validações globais de e-mail em vários pontos; WhatsApp consistente em `register` / `register/organization`, mas **não** no `plan-purchase` para o admin criado pelo checkout (telefone só em `tenants.billing_phone`).
- **Job de expiração de trial** não foi encontrado como processo que suspende tenant automaticamente ao passar `trial_ends_at` — bloqueio é mais por **feature** que por status global.
- **Revert** de `cancelExpiredPendingBillings` para `trial` pode ser conceitualmente estranho para contas **somente** criadas para pagamento.

---

## 10. Proposta de fluxo único oficial (para decisão)

| Decisão | Proposta baseada no código atual | Alternativa |
|---------|-----------------------------------|-------------|
| **Porta única comercial pública** | **`/checkout` + `POST /api/plan-purchase`** para qualquer nova empresa **paga**; trial opcional só se produto mantiver plano `is_free` com regra explícita. | Manter trial só por convite ou área super admin. |
| **Trial** | Definir um único modelo: (A) só pós-login com plano free **sem** checkout, ou (B) trial com método de pagamento (requer desenho novo no gateway). | Desativar `is_free` em produção até haver regra clara. |
| **Cadastro `/register` e `/api/auth/register`** | **Redirecionar** para checkout ou **desativar** para visitantes; manter endpoint restrito (mobile, migração) se necessário. | Feature flag por ambiente. |
| **Momento do tenant** | Manter **antes do pagamento** para fluxo pago (`payment_pending`) — alinhado ao anti-fraude e ao gateway; ajustar revert do job se o status alvo não for `trial`. | Criar tenant só após pagamento exigiria reestruturar cobrança e identidade do cliente no gateway. |
| **Momento do admin** | **Senha definitiva já no checkout** simplifica onboarding; exige estender `createTenantAdminUser` e política de e-mail/WhatsApp únicos. | Manter placeholder + onboarding (menos mudança, mais passos). |
| **Cobrança pós-trial** | Só após existir **assinatura** (`subscriptions`); trial “puro” não gera renovação até primeira conversão paga. | Cupom / fatura manual no super admin. |

---

## 11. Estados e transições sugeridos (tenant / assinatura)

**Estados já existentes (constraint em migração `63_activation_plan_phase1.sql`):** `trial` \| `payment_pending` \| `active` \| `suspended`.

Sugestão de **modelo mental** (alinhar documentação e futuras migrações):

```
[trial] --(inicia checkout)--> [payment_pending] --(pagamento OK)--> [active]
[payment_pending] --(abandono / job cancel)--> [trial ou cancelled*]
[active] --(inadimplência / política)--> [suspended]
```

\* *Se o produto quiser evitar `trial` pós-abandono, introduzir estado opcional `cancelled` ou `draft` — **hoje não está no constraint citado**; exigiria migração.

**Assinatura (`subscriptions`):** `active` → renovações via jobs; cancelamento com `cancel_at_period_end` tratado em `expireCancelledSubscriptions`.

---

## 12. Plano de implantação incremental

1. **Inventário e telemetria:** medir uso real de `/api/auth/register` vs `plan-purchase` vs `register/organization` (logs/métricas).
2. **Unificação de validação:** extrair serviço compartilhado de unicidade (e-mail/WhatsApp) usado por checkout e registros legados.
3. **Ajuste de jobs:** revisar `cancelExpiredPendingBillings` para status alvo coerente com a política de abandono.
4. **Front:** CTAs únicos; feature flag para esconder `/register`.
5. **Onboarding:** enxugar passos se senha mudar para o checkout.
6. **Documentação de operação:** cron para `billing:scheduler`, worker, `cancel-expired-billings`, `check-trials`, webhook Asaas.

---

## 13. Riscos para produção

- Desligar `/api/auth/register` sem migração quebra clientes mobile ou integrações desconhecidas.
- Mudança de estados ou job pode deixar tenants **sem acesso** ou **com acesso indevido** se não houver rollback.
- **Globais vs por-tenant:** migração `66_users_tenant_email_unique` sugere unicidade de e-mail **por tenant** no BD, enquanto vários fluxos aplicam unicidade **global** — decisões futuras devem alinhar app e constraint.
- Gateway Asaas e webhooks: alterar ordem de criação de customer/tenant pode afetar reconciliação e idempotência.

---

## 14. Estratégia de migração segura

- Manter endpoints legados **desligados por padrão só após** período de observação e redirecionamento 302 no front.
- **Tenants existentes:** nenhuma migração destrutiva de status sem backfill; novos fluxos só em código com feature flags.
- Rollout: homologação com mesma base de planos e gateway sandbox; validar webhook + polling em paralelo antes de cortar caminhos antigos.

---

## 15. Checklist de validação (pré e pós mudança)

**Pré-mudança (baseline)**

- [ ] Listar volume de tenants por `created_via` e `status`.
- [ ] Confirmar crons em produção: scheduler, worker, cancel expired, reconciliation, check-trials.
- [ ] Webhook Asaas respondendo 200 e eventos chegando em `payment_gateway` / logs.

**Pós-mudança (fluxo único)**

- [ ] Novo cliente: checkout → PIX → `active` → login → dashboard.
- [ ] Abandono: após N horas, tenant e fatura em estado esperado pela política.
- [ ] Upgrade logado: `plan-purchase` sem criar tenant duplicado.
- [ ] Trial (se mantido): `trial_ends_at` → features off / `plan_expired` coerente.
- [ ] Renovação: job enfileira e gera nova fatura para `subscriptions` ativa.

---

## Apêndice A — Campos do plano (referência)

| Campo (plans) | Uso principal |
|---------------|----------------|
| `billing_interval` | Metadado do plano; valor efetivo na compra vem do body (`billing_interval`) e `plan_interval_prices` para custom. |
| `max_users` / overrides | Limites; `max_users_override` no tenant no checkout custom. |
| `plan_type` | `standard` vs `custom` (preço por usuário × intervalo). |
| `is_default` | Escolhido em `authController.register` quando monta tenant. |
| `is_free` + `free_access_days` | Trial com término em `trial_ends_at` nos fluxos de registro **sem** cobrança imediata. |
| `is_active` / `sort_order` | Disponibilidade e ordenação na vitrine. |

---

## Apêndice B — Endpoints resumidos

| Área | Método | Caminho (prefixos típicos) |
|------|--------|----------------------------|
| Planos | GET | `/api/plans` |
| Cadastro legado | POST | `/api/auth/register` |
| Wizard org | POST | `/api/auth/register/check-admin`, `/api/auth/register/organization` |
| Contratação | POST | `/api/plan-purchase` |
| Cobrança status | GET | `/api/billing/:billingId/status` |
| Onboarding | POST | `/api/onboarding/create-admin` |
| Webhook | POST | `/webhooks/asaas` |
| Super admin | POST | `/api/superadmin/notifications/check-trials` |

---

*Documento gerado para apoiar decisão arquitetural; trechos marcados como incerteza devem ser validados em ambiente de staging com dados reais.*
