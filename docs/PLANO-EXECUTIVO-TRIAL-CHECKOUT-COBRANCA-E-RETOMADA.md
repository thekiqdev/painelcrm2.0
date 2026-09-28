# Plano executivo — trial no checkout, cobrança e retomada

**Tipo:** plano técnico de implantação (sem código nesta etapa).  
**Base:** `PLANO-MESTRE-FLUXO-CONTRATACAO-NOVAS-EMPRESAS.md` e decisões de produto aprovadas (mar/2026).

---

## 1. Resumo executivo

Este plano descreve como evoluir o PainelCRM para:

- **Um único fluxo público** de novas empresas em **`/checkout`**, incluindo seleção de plano, dados da empresa, administrador (com **senha definitiva**), resumo e etapa de **pagamento ou início de trial** conforme regra do plano.
- **Trial configurável por plano** (dias antes da cobrança obrigatória), **sem** assumir débito automático invisível em cartão nesta fase.
- **Bloqueio real** após fim do trial, com **redirecionamento** para retomada de contratação/pagamento no mesmo checkout.
- **Onboarding opcional** (WhatsApp, usuários extras, dados complementares).
- **Preservação** da cadeia existente: `subscribePlan`, webhooks Asaas, polling `GET /api/billing/:id/status`, `activatePlanFromBilling`, assinaturas e jobs de recorrência **quando houver cobrança gerada**.

---

## 2. Fluxo final desejado (ponta a ponta)

### 2.1 Caminho A — Trial primeiro (sem cobrança na conclusão do checkout)

1. Usuário acessa **`/checkout`** (com ou sem plano pré-selecionado vindo da landing).
2. Seleciona plano (se necessário), preenche empresa + administrador (e-mail, WhatsApp, senha), revisa resumo.
3. **Backend** cria **tenant** em `trial` com `trial_ends_at = now() + trial_days` (origem: plano), **admin** com senha hash real, vínculos atuais de perfil/roles.
4. **Não** chama `subscribePlan` neste momento (nenhuma fatura SaaS obrigatória).
5. Usuário recebe **JWT** (login automático) ou é redirecionado para login com credenciais criadas — **definir UX única** (recomendação: login automático + `/dashboard`).
6. Durante o trial, acesso normal respeitando limites do plano.
7. Ao **atingir o fim do trial** (ver §6–8), o tenant passa a **bloqueado** e o usuário é **forçado** ao fluxo de **retomada no `/checkout`** com `tenant_id` seguro.
8. No retomada, gera-se cobrança via **`POST /api/plan-purchase`** (fluxo já existente) ou endpoint dedicado que reutiliza a mesma orquestração; ao pagar, **`activatePlanFromBilling`** mantém-se.

### 2.2 Caminho B — Pagamento imediato (sem trial ou trial zero)

1. Mesmo wizard até o resumo.
2. Etapa de pagamento: **`subscribePlan`** + gateway como hoje; tenant pode ser criado **`payment_pending`** antes da confirmação do gateway (comportamento próximo ao atual) **ou** criado já `trial` com transição — **decisão de implementação** deve manter uma única regra clara (ver §3).

**Nota:** O produto pode permitir **ambos** no mesmo checkout: se `plan.trial_days > 0` e política “trial primeiro”, seguir Caminho A; se usuário escolher “pagar agora” ou `trial_days = 0`, seguir Caminho B. A UI deve deixar isso explícito.

### 2.3 Caminho C — Upgrade de tenant já logado

- **Inalterado em espírito:** `POST /api/plan-purchase` com `req.tenantId` (usuário autenticado), sem recriar empresa.
- Garantir que flags de “retomada pós-trial” **não** interfiram quando `tenant.status === active` e há pagamento de upgrade.

---

## 3. Trial no checkout sem quebrar a cobrança atual

**Princípio:** separar **criação de conta em trial** (sem `tenant_billing` pendente) da **geração de cobrança** (`subscribePlan`), que permanece o único caminho para criar fatura SaaS + integração gateway nos fluxos pagos.

| Situação | Comportamento |
|----------|----------------|
| Conclusão “só trial” | Não chamar `validatePlanForPurchase` para “compra” de plano grátis confundindo com trial — introduzir **`trial_days`** (ou reuso controlado de `free_access_days`) no plano como **duração de trial**, distinto de “plano gratuito permanente”. |
| Primeira cobrança | Somente na retomada ou quando o usuário optar por pagar antes do fim do trial; aí sim `subscribePlan` + URLs/PIX/boleto como hoje. |
| Após pagamento | `activatePlanFromBilling` + `subscriptions` — **sem mudança conceitual**. |

**Esclarecimento de modelo de dados de plano:** hoje existem `is_free` e `free_access_days`. O plano executivo recomenda:

- Adicionar **`trial_days`** (inteiro, ≥ 0) como fonte de verdade para “dias de trial antes da cobrança” no checkout, **ou**
- Renomear semanticamente em documentação e usar `free_access_days` exclusivamente para trial de checkout (e descontinuar “plano grátis para sempre” ou mapear para outro campo).

**Evitar:** usar `is_free = true` + `subscribePlan` simultaneamente — hoje `validatePlanForPurchase` bloqueia plano `is_free` na compra; trial pós-checkout pago deve ser resolvido sem esse choque.

---

## 4. Momento de criação do tenant

| Fluxo | Proposta |
|-------|----------|
| **Trial primeiro** | Criar tenant **após validação** dos dados de empresa/admin e **antes** de devolver sucesso ao front (transação única recomendada: tenant + user + perfis). Status inicial: **`trial`**, `trial_ends_at` definido. |
| **Pagamento imediato** | Manter padrão atual: criar tenant **`payment_pending`** ao iniciar compra anônima, depois `subscribePlan`; ao pagar → `active`. Alternativa mais limpa: criar tenant `trial` com `trial_ends_at` curto **ou** `payment_pending` apenas até confirmação — **equipe deve escolher um** para não duplicar tenants órfãos. |

**Recomendação de segurança:** uma única transação por “conclusão da etapa de cadastro” no checkout trial, com rollback se falhar qualquer insert.

---

## 5. Momento de criação do admin com senha definitiva

- **No mesmo request** que cria o tenant em modo trial (ou no mesmo bloco transacional imediatamente após INSERT do tenant).
- Estender **`createTenantAdminUser`** (ou novo wrapper) para aceitar **`password`** obrigatório quando o fluxo for checkout trial.
- **Não** depender de onboarding para definir senha.

---

## 6. Identificação de trial expirado

1. **`trial_ends_at < now()`** e tenant ainda em estado que denota trial ativo **ou** transição pendente.
2. Job (cron) **diário ou horário** que:
   - localiza `tenants` com `status = 'trial'` e `trial_ends_at <= now()`;
   - aplica transição para estado bloqueado (ver §11);
   - idempotente: não reprocessar se já `suspended` com motivo trial.

3. **Checagem em tempo real** no login/`/api/auth/me`: se trial expirou e ainda não processou job, aplicar bloqueio ou retornar flags para o front forçar retomada (recomenda-se **consistência** com o job para não depender só do client).

---

## 7. Bloqueio de acesso após fim do trial

**Camadas sugeridas:**

1. **Backend — `tenantAuth` / middleware dedicado:** após autenticação, se tenant está **bloqueado por trial expirado**, responder **`402`** ou **`403`** com código estável (`TRIAL_EXPIRED`, `PAYMENT_REQUIRED`) e **sem** dados de negócio do CRM nas rotas protegidas.
2. **Feature flags:** `featureFlagService` já zera features em trial vencido com `status === trial` — reforçar após mudança de status para `suspended` (ver §11).
3. **Frontend — `AuthGuard` / layout:** se `/me` indica bloqueio, redirecionar para **`/checkout?resume=...`** (ver §9).

**Importante:** hoje `requireActivePlanPeriod` só olha `plan_period_end`; tenants só em trial podem ter `plan_period_end` nulo — o **novo middleware ou extensão** deve tratar **trial expirado** explicitamente.

---

## 8. Redirecionamento automático para pagamento/retomada

1. **Contrato de API:** `GET /api/auth/me` (e opcionalmente `GET /api/auth/login` response) inclui:
   - `tenant_status`
   - `trial_ends_at`
   - `requires_checkout_resume: boolean`
   - `checkout_resume_token` ou apenas **`tenant_id`** assinado / vinculado à sessão (preferir **não** expor token opaco sem validação server-side).

2. **Frontend:** rotas do app CRM verificam `requires_checkout_resume`; se true, **`Navigate` para `/checkout`** com state `{ mode: 'resume', tenantId }` ou query param controlada.

3. **Segurança:** retomada só com **usuário autenticado** que pertença ao tenant bloqueado; opcionalmente segundo fator ou revalidação de e-mail no futuro.

---

## 9. Retomada no `/checkout` sem recomeçar do zero

**Objetivo:** pré-preencher plano, empresa, e-mail, WhatsApp a partir do tenant e do admin existentes; usuário só confirma dados, CPF/CNPJ se faltar, e **gera cobrança**.

**Mecânica sugerida:**

- Rota **`GET /api/me/tenant/checkout-context`** (nome ilustrativo) retorna dados não sensíveis + indicação do `plan_id` alvo e valores.
- **`POST /api/plan-purchase`** com **`req.tenantId`** (usuário logado) já funciona para upgrade — estender validação: se tenant `suspended` + `trial_expired`, permitir gerar cobrança e, ao pagar, **`activatePlanFromBilling`** restaura `active`.

**Front:** modo `resume` em `PlanCheckout` pula etapas já satisfeitas ou mostra resumo editável limitado.

---

## 10. Proteção contra múltiplos trials para a mesma “empresa”

### 10.1 Identificadores

| Sinal | Uso |
|-------|-----|
| **CPF/CNPJ** (normalizado, só dígitos) | Principal para pessoa jurídica/física no Brasil; único índice parcial onde `cpf_cnpj IS NOT NULL`. |
| **E-mail do admin** | Já validado globalmente em vários fluxos; manter. |
| **WhatsApp** | Normalização `normalizeWhatsappDigits`; igual ao wizard atual. |
| **Slug / nome** | **Não** usar como única proteção (colisão e nomes genéricos). |

### 10.2 Regra de negócio

- Ao iniciar **novo** trial pelo checkout, consultar: existe tenant com mesmo **CPF/CNPJ** **ou** combinação política aprovada que já **consumiu trial**?
- Persistir **`trial_consumed_at`** ou boolean **`has_used_trial`** no `tenants` (ou tabela `tenant_trial_events`) na **primeira** conclusão de trial.

### 10.3 “Mesma empresa”

- Definição operacional: mesmo **documento fiscal** (CPF/CNPJ) **ou** mesmo **tenant_id** (óbvio).
- E-mail/WhatsApp: bloquear **novo** trial se já associados a tenant com `has_used_trial = true` **ou** com assinatura paga histórica.

---

## 11. Status do tenant — proposta técnica (decisão)

### 11.1 Comparativo

| Abordagem | Prós | Contras |
|-----------|------|---------|
| **Novo status `expired`** | Semântica explícita | Exige **ALTER** na `CHECK` de `tenants.status` (`63_activation_plan_phase1.sql`); revisar todos os `WHERE status` no código e relatórios. |
| **`suspended` + motivo** | Reutiliza valor já permitido no CHECK; `featureFlagService` já trata `suspended`; relatórios já contam `suspended` | É necessário **diferenciar** suspensão por inadimplência, manual super admin, vs trial — **obrigatório** campo complementar. |

### 11.2 Recomendação (menor risco)

**Adotar `status = 'suspended'`** para “trial expirado / aguardando pagamento”, com:

- Coluna nova **`suspension_reason`** `TEXT` ou `ENUM` com valores mínimos: `trial_expired`, `payment_overdue`, `manual`, …
- Opcional: **`suspended_at`** `TIMESTAMPTZ`.

**Por quê:** não altera o conjunto de valores do `CHECK` existente; impacto controlado em consultas que hoje assumem “todo suspended é igual”. Será preciso **ajustar** dashboards que somam `suspended` sem quebrar significado (filtro por `suspension_reason`).

**Não recomendado nesta fase:** introduzir `expired` sem necessidade forte de relatório — custo de migração e regressão maior.

**Alternativa se quiser evitar misturar com inadimplência:** manter `trial` + coluna **`access_blocked_reason`** + **`trial_expired_at`**, e **bloquear** por middleware mesmo com `status = trial` — porém decisão 8 pede “não continuar usando normalmente”, e **`suspended`** comunica melhor ao restante do sistema que o tenant não está operacional.

---

## 12. Estados e transições — tenant

```
trial (trial_ends_at futuro)
  → [job ou check login] → suspended (suspension_reason = trial_expired)  [fim do trial sem pagamento]

trial
  → [plan-purchase pago] → active (via activatePlanFromBilling) [pagamento durante trial]

payment_pending
  → [pagamento confirmado] → active
  → [cancel job abandon] → ajustar: não reclassificar como trial “novo” se trial já foi consumido — ver job §14

active
  → [recorrência / inadimplência futura] → suspended (outros motivos)
```

---

## 13. Estados e transições — assinatura / cobrança

- **Sem mudança obrigatória** no modelo de `subscriptions` para a fase “só trial”: assinatura **só nasce** após primeiro **`activatePlanFromBilling`**.
- **tenant_billing:** continua representando cobranças pontuais; retomada pós-trial usa o mesmo pipeline.
- **Evolução futura (opcional):** assinatura com método de pagamento e cobrança no fim do trial — documentar como fase 2, não requisito.

---

## 14. Mudanças necessárias — frontend

| Área | Mudança |
|------|---------|
| `PlanCheckout.tsx` | Novas etapas: plano → empresa → admin → resumo → pagamento **ou** conclusão trial; senha admin; modo `resume`. |
| Landing / CTAs | Todos para `/checkout`; remover fluxo paralelo de registro (redirecionamento). |
| `AuthGuard` / router | Detectar `requires_checkout_resume` e redirecionar para `/checkout`. |
| `Onboarding.tsx` | Tornar opcional; rotas não bloqueantes para CRM core. |
| Páginas de login | Mensagem e link para retomada se trial expirou. |

---

## 15. Mudanças necessárias — backend

| Área | Mudança |
|------|---------|
| `planPurchaseController` / novo controller | Endpoint de “finalizar cadastro trial” OU estender contrato do checkout com `mode=trial`. |
| `createTenantAdminUser` | Senha obrigatória no fluxo checkout. |
| `validatePlanForPurchase` / planos | Campo `trial_days` e regras claras vs `is_free`. |
| `activatePlanFromBilling` | Ao pagar com tenant `suspended` + `trial_expired`, limpar suspensão e setar `active`. |
| `authController` getMe | Flags de retomada; `suspension_reason`. |
| `login` | Opcional: bloquear ou sinalizar trial expirado antes de emitir token completo — preferir token + bloqueio em middleware para permitir acesso só ao checkout. |
| Novo endpoint | `checkout-context` para retomada. |

---

## 16. Mudanças necessárias — banco de dados

| Item | Descrição |
|------|-----------|
| `plans` | `trial_days` (ou política clara para reuso de `free_access_days`). |
| `tenants` | `suspension_reason`, opcional `suspended_at`; `has_used_trial` ou evento de auditoria. |
| Índice único | `(cpf_cnpj)` normalizado onde aplicável **ou** tabela de “trial já usado por documento”. |
| Migração | Backfill: tenants ativos antigos → `has_used_trial = true` se já pagaram ou se trial já passou. |

---

## 17. Mudanças — onboarding

- Remover **gate** que obriga onboarding para uso do sistema.
- Manter rotas **opcionais** para WhatsApp, convites, dados extras.
- `POST /api/onboarding/create-admin` deixa de ser o lugar da **primeira** senha (checkout assume isso); pode virar “atualizar perfil” ou ser depreciado para esse caso.

---

## 18. Mudanças — `/register` e `/api/auth/register`

- **Front:** `/register` → redirect 302 para `/checkout` (ou página estática explicando o novo fluxo).
- **API:** `POST /api/auth/register` — desativar para público **ou** retornar **`410 Gone`** / mensagem com link para checkout; exceção controlada por **feature flag** para apps legados até migração.

---

## 19. Mudanças — middleware de acesso

- Estender **`requireActivePlanPeriod`** ou novo **`requireTenantCommercialState`**: ordem sugerida — autenticação → tenant suspenso por trial → plan_period_end → RLS.
- Lista de rotas **allowlist** sem bloqueio: `/api/auth/me`, `/api/plan-purchase`, `/api/billing/*/status`, assets, logout.

---

## 20. Mudanças — jobs / crons

| Job | Função |
|-----|--------|
| **Novo:** expiração de trial | Marca `suspended` + `trial_expired` quando `trial_ends_at` passou e não há `activated_billing_id` / sem pagamento. |
| `cancelExpiredPendingBillings` | Revisar: não “dar trial de novo” a tenant que já consumiu trial; não conflitar com `suspended` pós-trial. |
| `check-trials` (super admin) | Opcionalmente alinhar queries com `suspension_reason`. |
| Recorrência | Sem alteração obrigatória nesta fase. |

---

## 21. Checkout — retomada (resumo técnico)

- Query: `?mode=resume` + sessão autenticada.
- Backend valida tenant pertence ao usuário e está em estado retomável.
- Reutilizar **`POST /api/plan-purchase`** logado com body mínimo (plano, intervalo, método) — mesma lógica de upgrade.

---

## 22. Compatibilidade — tenants existentes

- Migração: tenants `active` inalterados; `trial` com `trial_ends_at` no passado → job único de alinhamento para `suspended` + motivo (comunicação prévia).
- Tenants nunca em trial: `has_used_trial` conforme histórico de `tenant_billing` pago.

---

## 23. Compatibilidade — upgrade logado

- Testes de regressão: `plan-purchase` com `req.tenantId` e tenant `active`.
- Garantir que `suspended` **trial** não use o mesmo código que bloqueia upgrade sem querer — regras explícitas no controller.

---

## 24. Feature flags sugeridas

| Flag | Finalidade |
|------|------------|
| `CHECKOUT_TRIAL_V1` | Liga criação de trial pelo novo checkout. |
| `DISABLE_PUBLIC_LEGACY_REGISTER` | Corta `/api/auth/register` público. |
| `TRIAL_EXPIRATION_JOB` | Liga job de suspensão automática. |
| `CHECKOUT_RESUME_V1` | Liga retomada guiada no front. |

---

## 25. Rollout seguro

1. **Fase 1 — Backend:** colunas + job em **shadow** (só log, sem UPDATE).
2. **Fase 2 — Job ativo** em horário de baixo uso; monitorar `suspended`.
3. **Fase 3 — Front checkout** trial; feature flag para % de usuários.
4. **Fase 4 — Redirect** `/register`; desligar legado.

---

## 26. Estratégia de rollback

- Flags desligam novos fluxos.
- Job de suspensão: versão anterior do binário ou `UPDATE` manual de tenants afetados em janela controlada.
- Migrações: scripts reversos para colunas novas (drop com cuidado se já houver dados).

---

## 27. Checklist de homologação

- [ ] Novo cadastro: trial N dias → acesso → job suspende ao fim.
- [ ] Login pós-expiração: redireciona para checkout retomada.
- [ ] Pagamento na retomada: `active`, `plan_period_*` preenchidos, features ok.
- [ ] Mesmo CPF/CNPJ não inicia segundo trial.
- [ ] Upgrade logado inalterado.
- [ ] Webhook + polling ativam plano como hoje.
- [ ] Onboarding opcional não bloqueia dashboard.
- [ ] Super admin: relatórios de `suspended` compreendem motivo.

---

## 28. Evolução futura (não requisito desta fase)

- Cobrança automática no fim do trial com método salvo (Asaas subscription / cartão com consentimento explícito).
- Lembrete por e-mail/WhatsApp antes do `trial_ends_at`.

---

*Documento preparado para execução de implementação incremental; revisar com o time de produto os nomes exatos de flags e a política final de “trial_days” vs campos legados de plano.*
