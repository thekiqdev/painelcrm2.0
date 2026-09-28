# Auditoria técnica — Fase 2 (trial no checkout, cobrança e retomada)

**Data:** 2026-03-31  
**Referência:** `docs/PLANO-EXECUTIVO-TRIAL-CHECKOUT-COBRANCA-E-RETOMADA.md`  
**Escopo:** validação do código implementado e correções aplicadas na rodada de auditoria.

---

## 1. Resumo da auditoria

A implementação cobre o núcleo do plano: signup trial sem `subscribePlan`, tenant em `trial` com `trial_ends_at`, anti–segundo trial, job de expiração, retomada via `plan-purchase` + `activatePlanFromBilling`, e flags por variável de ambiente.

Foram encontrados **desvios reais** em relação ao rollout descrito no plano (§24): o middleware de CRM e o ramo de `cancelExpiredPendingBillings` alteravam comportamento **mesmo com todas as flags Fase 2 desligadas**; o middleware bloqueava **qualquer** `suspended`, além do escopo trial do documento; o front redirecionava para `/checkout?mode=resume` **sem** respeitar `VITE_CHECKOUT_RESUME_V1`; o bloqueio por documento no anti–trial usava `length >= 11` em vez de CPF/CNPJ válidos.

Esses pontos foram **corrigidos no código** nesta auditoria (ver §4).

---

## 2. Itens conferidos no código e alinhados ao plano

### A. Trial no checkout

| # | Verificação | Evidência no código |
|---|-------------|---------------------|
| 1 | Signup trial **não** chama `subscribePlan` | `postCompleteSignupTrial` só insere tenant + `createTenantAdminUser` + JWT; não importa chamada a `subscribePlan`. |
| 2 | Tenant nasce em `trial` | `INSERT ... status ... 'trial'` em `planPurchaseController.ts`. |
| 3 | `trial_ends_at` preenchido | `now() + ($8::int * interval '1 day')` com `trialDays` do plano. |
| 4 | Admin com senha definitiva | `password: pwd` em `createTenantAdminUser` dentro da transação. |
| 5 | Login automático | Resposta `201` com `token` + `user`; front usa `setTokenAndUser` + `refreshUser` + `navigate('/dashboard')`. |
| 6 | Trial só com `trial_days >= 1` e plano não `is_free` | Query `trial_days`, `is_free`; erro `PLAN_HAS_NO_TRIAL`. |
| 7 | Fluxo pago Fase 1 com `trial_days = 0` | `showTrialOnSummary` exige `trial_days > 0`; `postPlanPurchase` inalterado no contrato principal. |

### B. Segundo trial

| # | Verificação | Evidência |
|---|-------------|-----------|
| 8–10 | CPF/CNPJ válido, e-mail, WhatsApp | `trialSignupGuardService`: consultas a `tenants`/`users` com `has_used_trial` (documento após correção com `isValidCpfOrCnpj`). |
| 11 | Consumo de trial | `has_used_trial`, `trial_consumed_at` no INSERT trial; migração adiciona colunas. |
| 12–13 | Backfill e falsos positivos | Ver **§6** (risco residual); CPF inválido/tamanho errado não entra na query por documento (após correção). |

### C. Bloqueio pós-trial

| # | Verificação | Evidência |
|---|-------------|-----------|
| 14 | Job → `suspended` + `trial_expired` | `expireTrialsPastDue` com flag `TRIAL_EXPIRATION_JOB`. |
| 15 | Checagem em tempo real | `trialEndedUnpaid` no middleware (quando gate Fase 2 ativo). |
| 16–18 | CRM bloqueado, código estável | HTTP **403** com `code: 'TRIAL_EXPIRED'`, `requires_checkout_resume: true` (com gate ativo). |

### D. Retomada

| # | Verificação | Evidência |
|---|-------------|-----------|
| 19 | `GET /api/auth/me` | `tenant_status`, `trial_ends_at`, `suspension_reason`, `requires_checkout_resume` (este último condicionado ao gate Fase 2 após auditoria). |
| 20–21 | Redirecionamento e contexto | `AuthContext` + `PlanCheckout` com `?mode=resume` e `GET /api/me/tenant/checkout-context` (flag `CHECKOUT_RESUME_V1`). |
| 22–23 | Cobrança e reativação | `postPlanPurchase` logado → `subscribePlan` → pagamento → `activatePlanFromBilling` (inalterado como núcleo). |
| 24 | Limpeza de suspensão | `UPDATE` em `activatePlanFromBilling` com `suspension_reason = NULL`, `suspended_at = NULL`. |

### E. Compatibilidade

| # | Verificação | Evidência |
|---|-------------|-----------|
| 25–28 | Fase 1 / body `plan-purchase` | Schema Zod com `password` opcional; ramo `fullCheckout` só anônimo completo. |
| 29 | `password` não obrigatório no upgrade | Mesmo schema; lógica `upgradeLogged` não exige senha. |
| 30 | `cancelExpiredPendingBillings` | Ramo Fase 2 em `has_used_trial` **somente** com gate OR das três flags (após auditoria). |
| 31 | Recorrência | `activatePlanFromBilling` + `createSubscription` preservados; sem alteração do worker de recorrência nesta Fase 2. |

### F. Flags (após correções)

| # | Verificação |
|---|-------------|
| 32–33 | `isPhase2TrialCrmGateEnabled()` = `CHECKOUT_TRIAL_V1 \|\| TRIAL_EXPIRATION_JOB \|\| CHECKOUT_RESUME_V1` controla middleware, `requires_checkout_resume` coerente e ramo Fase 2 de `cancelExpired`. Com **todos** false, comportamento anterior nesses pontos. |
| 34 | Endpoints `complete-signup-trial` e `checkout-context` continuam com flags próprias; coluna `plans.trial_days` existe após migração (dado exposto na API pública), sem alterar fluxo até o front usar `VITE_CHECKOUT_TRIAL_V1`. |

---

## 3. Gaps encontrados (antes desta auditoria)

1. **Middleware** aplicava bloqueio trial/suspensão **sem** exigir nenhuma flag Fase 2 → violava rollout §24.
2. **Middleware** bloqueava **todo** `status = 'suspended'` com `TENANT_SUSPENDED` → escopo maior que o plano (foco trial / `trial_expired`); risco de regressão para suspensões não relacionadas a trial.
3. **`cancelExpiredPendingBillings`** alterava transição `payment_pending` → `suspended`/`trial_expired` mesmo com flags Fase 2 desligadas → inconsistência com “voltar ao comportamento anterior”.
4. **`GET /api/auth/me`** sempre podia marcar `requires_checkout_resume` enquanto o middleware podia estar “desligado” logicamente → UX incoerente.
5. **Front:** redirecionamento fixo para `/checkout?mode=resume` ignorava `VITE_CHECKOUT_RESUME_V1` → utilizador sem retomada UX podia ficar preso ou ver fluxo incompleto.
6. **Anti–trial por documento:** uso de `length >= 11` permitia documentos inválidos ou ambíguos sem validação de dígitos verificadores → desalinhado a “CPF/CNPJ normalizado” do plano.

---

## 4. Correções aplicadas nesta auditoria

| O quê | Por quê | Arquivos |
|-------|---------|----------|
| Função `isPhase2TrialCrmGateEnabled()` | Gate único OR das três env vars, alinhado ao rollout. | `checkoutTrialFeatureFlags.ts` |
| Middleware: só age se gate ativo; removido bloqueio genérico de `suspended` | Restringir ao plano (trial vencido / `trial_expired`) e respeitar flags. | `auth.ts` |
| `requires_checkout_resume` só se gate ativo | Coerência API × middleware. | `authController.ts` |
| `cancelExpiredPendingBillings`: ramo `suspended`/`trial_expired` só com gate; senão revert só para `trial` como antes | Evitar efeitos Fase 2 com flags desligadas. | `subscriptionService.ts` |
| Documento no anti–trial: `isValidCpfOrCnpj` | CPF/CNPJ válidos antes de deduplicar por `cpf_cnpj`. | `trialSignupGuardService.ts` |
| Redirecionamento: `VITE_CHECKOUT_RESUME_V1` → checkout retomada; senão `/meu-plano` | Evitar retomada UX sem flag; desbloquear caminho de pagamento. | `AuthContext.tsx` |
| Comentário no `env.example` | Documentar dependência do gate. | `env.example` |

---

## 5. Arquivos alterados nesta auditoria

- `packages/backend/src/config/checkoutTrialFeatureFlags.ts`
- `packages/backend/src/middleware/auth.ts`
- `packages/backend/src/controllers/authController.ts`
- `packages/backend/src/services/subscriptionService.ts`
- `packages/backend/src/services/trialSignupGuardService.ts`
- `src/contexts/AuthContext.tsx`
- `env.example`
- `docs/AUDITORIA-FASE2-TRIAL-CHECKOUT.md` (este documento)

---

## 6. Riscos restantes

- **Migração 90:** `UPDATE` marca `has_used_trial = true` para **todos** os tenants em `trial` e para `active` / com `activated_billing_id` — agressivo para legado; pode impedir novo trial mesmo onde o produto aceitaria (decisão de negócio).
- **Super admin com `tenant_id`:** middleware ignora bloqueio comercial se `is_super_admin` — utilizador super admin ligado a um tenant CRM continua sem bloqueio trial na API (comportamento explícito no código).
- **Timezone:** `trial_ends_at` e comparações usam `Date` no Node/browser; pequenos desvios de fuso em relação ao “fim do dia” comercial podem ocorrer.
- **Estado já gravado:** se em algum ambiente as flags foram ligadas e depois desligadas, linhas já `suspended`/`trial_expired` permanecem no banco; com gate desligado o CRM volta a responder (dados inconsistentes com intenção de produto até correção manual).
- **Plano pedia código `PAYMENT_REQUIRED`:** API usa `TRIAL_EXPIRED` — divergência de nomenclatura apenas; contrato interno é estável.
- **`AuthGuard`:** não duplica lógica de retomada; depende de `AuthContext` + `/api/auth/me` — rotas fora do provider não têm o mesmo redirect.

---

## 7. Checklist de homologação manual (staging)

- [ ] **Trial signup:** plano com `trial_days > 0`, flags `CHECKOUT_TRIAL_V1` + `VITE_CHECKOUT_TRIAL_V1`; fluxo até dashboard; rede sem chamada a `subscribePlan`.
- [ ] **Sem trial:** `trial_days = 0`; fluxo pago idêntico à Fase 1 (PIX/boleto/cartão).
- [ ] **Expiração:** `TRIAL_EXPIRATION_JOB=true`; job `npm run trial:expire`; tenant `trial` → `suspended` + `suspension_reason = trial_expired`.
- [ ] **Bloqueio CRM:** após expiração, chamada autenticada a rota `tenantAuth` → 403 `TRIAL_EXPIRED`.
- [ ] **Retomada:** `CHECKOUT_RESUME_V1` + `VITE_CHECKOUT_RESUME_V1`; `/checkout?mode=resume` carrega contexto; `POST /api/plan-purchase` gera cobrança.
- [ ] **Reativação:** pagamento teste → `activatePlanFromBilling` → `active`, `suspension_reason` nulo.
- [ ] **Upgrade logado:** tenant `active`; `plan-purchase` sem corpo de senha obrigatório.
- [ ] **Flags off:** `CHECKOUT_TRIAL_V1`, `TRIAL_EXPIRATION_JOB`, `CHECKOUT_RESUME_V1` todos `false`; confirmar que middleware não bloqueia trial legado só por data e que `cancelExpired` reverte só para `trial`.
- [ ] **Segundo trial:** mesmo CPF válido / e-mail / WhatsApp após trial consumido → `TRIAL_ALREADY_CONSUMED`.
- [ ] **Webhook/polling/recorrência:** regressão smoke após primeiro pagamento (fora do escopo de alteração, mas obrigatório em release).

---

*Documento gerado como parte da auditoria técnica final da Fase 2.*
