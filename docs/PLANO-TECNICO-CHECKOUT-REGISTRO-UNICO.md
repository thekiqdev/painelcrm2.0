# Plano técnico: `/checkout` como fluxo único de cadastro

**Status:** planejamento (sem implementação neste documento).  
**Data de referência:** 2026-03-31.

## 1. Objetivo de produto

- Tornar o **checkout atual** (`/checkout`, componente `PlanCheckout`) o **único** fluxo oficial de **nova conta paga** no site.
- **Preservar** o layout visual atual (card do plano + etapas à direita, `LandingLayout`) e a **lógica de pagamento** existente (`POST /api/plan-purchase` → `subscribePlan` / gateway).
- **Eliminar** fluxos paralelos de cadastro de organização (ou redirecioná-los para o checkout).
- **Simplificar** campos conforme especificação: plano → empresa (com senha e WhatsApp) → resumo → pagamento (com CPF/CNPJ antes da cobrança, exibindo nome da empresa).

---

## 2. Mapeamento técnico atual

### 2.1 Arquitetura do `/checkout`

| Item | Detalhe |
|------|---------|
| **Rota** | `GET /checkout` — `src/App.tsx` (lazy `PlanCheckout`). |
| **Componente** | `src/pages/PlanCheckout.tsx`. |
| **Layout** | `LandingLayout` (mesmo shell visual da landing). |
| **Origem do plano** | **Não** há etapa “Plano” na própria página. O plano vem de `useLocation().state`: `{ plan, billingInterval?, usersCount? }`. Se `plan` ausente, `useEffect` redireciona para `/landing`. |
| **Quem envia o state** | Principalmente `src/landingpage/components/Pricing.tsx` (“Contratar”) e `src/pages/MeuPlano.tsx` (upgrade/contratação). `src/pages/Index.tsx` (home legada) navega para `/checkout` **sem** state — comportamento a tratar (ver riscos). |
| **Etapas atuais (UI)** | 1) Dados da empresa — 2) Revisão — 3) Pagamento + resultado (PIX/boleto/link). Constante `STEPS` em `PlanCheckout.tsx`. |
| **Campos step 1 (hoje)** | Nome da empresa, **CPF/CNPJ**, e-mail, telefone, nome do responsável. **Não** há campo de senha. |
| **Plano “custom”** | Se `plan.plan_type === 'custom'`, exibe seletor de quantidade de usuários (`usersCount`) e envia `users_count` no body do `plan-purchase`. |

### 2.2 Como plano e quantidade de usuários trafegam hoje

1. **Frontend:** `navigate("/checkout", { state: { plan: { id, name, plan_type, price_cents, interval_prices, ... }, billingInterval, usersCount } })`.
2. **Persistência entre etapas:** apenas estado React + `location.state` (recarregar a página pode perder o state).
3. **Backend:** `POST /api/plan-purchase` com `plan_id`, `billing_interval`, opcional `users_count` (plano custom), `payment_method`, e dados de empresa quando anônimo.

### 2.3 Lógica de pagamento e criação de tenant/admin

| Camada | Arquivo / endpoint |
|--------|-------------------|
| Rota HTTP | `packages/backend/src/routes/planPurchaseRoutes.ts` → `POST /api/plan-purchase` |
| Controller | `packages/backend/src/controllers/planPurchaseController.ts` |
| Assinatura / fatura / gateway | `packages/backend/src/services/subscriptionService.ts` (`subscribePlan`) |
| Resolução de gateway | `packages/backend/src/modules/payments/gatewayResolver.ts`, `gatewayProvider`, configs globais SaaS |
| Admin do tenant | `packages/backend/src/services/tenantAdminService.ts` — `createTenantAdminUser` |

**Momento em que empresa e admin são criados (fluxo checkout anônimo):**

1. `resolveTenantId`: se não há sessão e não há `tenant_id` válido, cria **tenant** com `status = 'payment_pending'`, preenche `billing_email`, `billing_phone`, `cpf_cnpj`, `responsible_name` quando informados.
2. Validação de e-mail duplicado: consulta `users` por e-mail normalizado; se existir, erro `EMAIL_ALREADY_REGISTERED_USE_LOGIN` (tratado no controller com mensagem amigável).
3. Se há `email`, chama `createTenantAdminUser` — **senha placeholder** (hash de string `PENDING_...`), não a senha final do usuário.
4. Depois `subscribePlan` gera fatura/cobrança conforme método (PIX exige CPF/CNPJ válido no tenant — validação no controller).

**Pós-pagamento (UX):**

- `PlanCheckout` faz polling em `GET /api/billing/:id/status`; ao pagar, redireciona não logado para `/onboarding` com `tenantId` + prefill nome/e-mail.
- `packages/backend/src/controllers/onboardingController.ts` — `POST /api/onboarding/create-admin`: troca a senha do admin criado no checkout (ou cria admin em fallback).

**Gap em relação ao objetivo:** não há **validação de duplicidade de WhatsApp** no `plan-purchase`; o telefone vai para `tenants.billing_phone` e o admin criado por `createTenantAdminUser` **não** recebe `whatsapp_number` em `users` (diferente do fluxo `register/organization`).

### 2.4 Fluxos paralelos de cadastro (pontos do site)

| Fluxo | Rota / ação | Backend | Observação |
|-------|-------------|---------|------------|
| **Wizard organização** | `/register` — `RegisterOrganizationWizard` | `POST /api/auth/register/check-admin`, `POST /api/auth/register/organization` (`registerOrganizationController.ts`) | Cria tenant em **trial** (ou com trial por dias) + admin com **senha real** + CPF empresa + telefones. **Concorrente direto** ao objetivo de “só checkout”. |
| **Cadastro rápido WhatsApp (login)** | `/login` — `AuthWhatsApp`; modal `AuthModal` na landing | `POST /api/auth/register` (`authController.register`) | Cria usuário + tenant com **plano padrão** (`is_default` / primeiro ativo), sem pagamento. Depois `/register/steps` para completar perfil. |
| **Completar perfil** | `/register/steps` — `RegistrationSteps` | Perfil via `AuthContext` | Complemento pós-login; não é contratação, mas depende do fluxo `signUp`. |
| **Modal / componente** | `PlanPurchaseModal` | Mesmo `POST /api/plan-purchase` | Arquivo `src/components/plan/PlanPurchaseModal.tsx` — verificar se ainda há import em algum lugar (pode ser legado ou uso futuro). |

**Links na landing que ainda apontam para cadastro paralelo:**

- `src/landingpage/components/Hero.tsx` — `Link to="/register"`.
- `src/landingpage/components/CtaSection.tsx` — `Link to="/register"`.
- `src/pages/Login.tsx` — link para `/register`.

**Links já alinhados ao checkout:**

- `Pricing.tsx` — “Contratar” → `/checkout` com state.
- Parte da `Index.tsx` (home legada) — botões para `/checkout` (sem state de plano).

### 2.5 Divergências objetivo vs implementação atual

| Desejado | Hoje |
|----------|------|
| Etapa **Plano** no próprio fluxo (pular se veio da home com plano) | Plano só via `location.state`; sem etapa dedicada na página. |
| Empresa: nome, admin, e-mail, **WhatsApp**, **senha** | Sem senha no checkout; senha no `/onboarding` após pagamento. WhatsApp não é campo explícito de unicidade no checkout. |
| CPF/CNPJ **só antes da cobrança** (pagamento), com nome da empresa visível | CPF/CNPJ na **primeira** etapa hoje. |
| Resumo com plano, usuários, empresa, admin, e-mail, WhatsApp | Resumo atual foca plano, intervalo, usuários (se custom), valor — não lista explicitamente todos os campos desejados. |
| Duplicidade e-mail **e** WhatsApp | E-mail no `plan-purchase`; WhatsApp não validado no mesmo padrão do `register/organization`. |

---

## 3. Arquivos, rotas e serviços impactados (previsão)

### Frontend

- `src/pages/PlanCheckout.tsx` — reordenação de etapas, novos campos, validações, possível fetch de plano único quando não houver state.
- `src/landingpage/components/Pricing.tsx`, `src/landingpage/components/Hero.tsx`, `src/landingpage/components/CtaSection.tsx`, `src/landingpage/components/Navbar.tsx` / `AuthModal.tsx` — unificar CTAs para `/checkout` (e parâmetros).
- `src/pages/Login.tsx` — link “criar conta” → checkout ou landing com âncora.
- `src/pages/Register.tsx`, `src/pages/RegisterOrganizationWizard.tsx` — deprecar ou redirecionar.
- `src/contexts/AuthContext.tsx` — impacto se o fluxo WhatsApp deixar de criar tenant via `/api/auth/register` para novos usuários “comerciais”.
- `src/components/AuthGuard.tsx`, `src/utils/superAdminRedirect.ts` — rotas `/register` e `/register/steps` se mudarem regras de “cadastro incompleto”.
- `src/pages/Onboarding.tsx` — possível simplificação se senha já definida no checkout.
- `src/pages/MeuPlano.tsx` — já manda para checkout; revisar consistência de state.

### Backend

- `packages/backend/src/controllers/planPurchaseController.ts` — body schema: `password`, `whatsapp`/`phone` com regras de unicidade; opcional mover CPF para etapa posterior (persistir em tenant só antes de `subscribePlan` ou em transação).
- `packages/backend/src/services/tenantAdminService.ts` — aceitar senha real e `whatsapp_number` no insert de `users` / `profiles`.
- Reutilizar ou extrair funções de `registerOrganizationController.ts` (`assertAdminWhatsappAvailable`, normalização) para evitar duplicação divergente.
- `packages/backend/src/controllers/onboardingController.ts` — ajustar se admin já nasce com senha definitiva.
- `packages/backend/src/controllers/authController.ts` — política para `POST /api/auth/register` (manter só convite? só mobile? desativar para novo público?).

### Rotas HTTP relevantes

- `POST /api/plan-purchase`
- `POST /api/onboarding/create-admin`
- `POST /api/auth/register`, `POST /api/auth/register/check-admin`, `POST /api/auth/register/organization`
- `GET /api/billing/:id/status` (polling checkout)
- `GET /api/plans` (se houver etapa plano na UI)

---

## 4. Riscos para produção

1. **Remoção ou bloqueio do cadastro “grátis”** (`/api/auth/register`): usuários que hoje entram só com WhatsApp + senha sem cartão podem ser impactados; decisão de produto necessária (trial só via checkout com R$ 0, freemium desligado, etc.).
2. **Mudança do momento da senha:** hoje o admin “existe” antes do pagamento com senha temporária; passar a exigir senha na etapa empresa melhora UX de login, mas exige **migração cuidadosa** de `createTenantAdminUser` e possivelmente **redução** do papel do `/onboarding` (apenas dados extras ou eliminação de passos).
3. **WhatsApp duplicado:** regras devem ser **idênticas** às de `register/organization` e `auth/register` para não haver brecha (mesmo número em dois tenants).
4. **State do React Router:** usuário que atualiza `/checkout` no meio do fluxo pode perder plano; mitigação: query params (`?plan=`) ou `sessionStorage` para plano único.
5. **Index `/` vs `/landing`:** `HomeOrRedirect` mostra `LandingPage` em `/`; garantir que todos os CTAs “Começar” passem plano ou carreguem o plano default do `GET /api/plans`.
6. **Super Admin / planos:** “apenas 1 plano” no início é configuração de dados; código ainda pode listar vários — alinhar `Pricing` e `PlanCheckout` para não quebrar quando houver mais planos depois.
7. **Regressão de pagamento:** qualquer alteração no body de `plan-purchase` deve manter compatibilidade com usuários **logados** que fazem upgrade (`req.tenantId` presente) e com `MeuPlano`.

---

## 5. Implementação incremental sugerida

### Etapa A — Alinhamento e redirecionamentos (baixo risco)

- Mapear todos os links para `/register` e decidir: **301/302 no app** para `/checkout` ou para `/landing#pricing` com CTA único.
- Garantir que abrir `/checkout` sem state carregue **um plano default** (ex.: `is_default` de `GET /api/plans`) em vez de só redirecionar para `/landing`, se essa for a regra de produto.
- Documentar comportamento da home legada `Index.tsx` vs `LandingPage`.

### Etapa B — Backend: unicidade e dados do admin no checkout

- Incluir no schema de `plan-purchase`: `password` (opcional na primeira versão para feature flag), `whatsapp` com normalização `normalizeWhatsappDigits`.
- Chamar `assertAdminWhatsappAvailable` (ou equivalente compartilhado) **antes** de criar tenant/admin.
- Estender `createTenantAdminUser` para receber `whatsapp_number` e senha real quando o produto exigir.
- Retornar códigos estáveis (`EMAIL_ALREADY_REGISTERED_USE_LOGIN`, `WHATSAPP_ALREADY_REGISTERED_USE_LOGIN`) espelhando `registerOrganizationController`.

### Etapa C — Frontend `PlanCheckout`: novo funil de etapas

1. **Plano** — lista mínima ou card único; **skip** se `location.state.plan` existir.
2. **Empresa** — campos acordados + validação local; chamada opcional a endpoint de **só validação** (reutilizar `check-admin` ou novo `POST /api/plan-purchase/validate-identifiers`) antes de avançar.
3. **Resumo** — exibir dados acordados (incl. WhatsApp e qtd usuários).
4. **Pagamento** — exibir nome da empresa; capturar CPF/CNPJ se ainda não persistidos; manter chamada atual a `POST /api/plan-purchase` e UI de métodos + polling.

### Etapa D — Descontinuar fluxos paralelos

- `RegisterOrganizationWizard`: redirecionar para `/checkout` ou remover rota pública após período de transição.
- `POST /api/auth/register`: restringir (IP, feature flag, ou remover do público) conforme decisão de negócio.
- Ajustar `AuthModal` / `AuthWhatsApp`: fluxo “criar conta” pode passar a **só** login ou deep link para checkout.

### Etapa E — Onboarding

- Se senha já definida no checkout: simplificar `Onboarding` para dados opcionais (endereço, logo) ou redirecionar direto ao dashboard após primeiro login com JWT emitido no onboarding ou em novo endpoint pós-pagamento (avaliar segurança).

### Etapa F — Testes e observabilidade

- Testes manuais: PIX (CPF obrigatório), boleto, cartão; usuário logado vs anônimo; duplicidade e-mail/WhatsApp.
- Logs já existentes em `plan-purchase` / gateway: manter correlação com `tenant_id` novo.

---

## 6. Referências cruzadas no repositório

- `docs/IMPLANTACAO-FLUXO-CADASTRO-TENANT-ADMIN.md` — wizard `/register` (contexto histórico).
- `docs/INVESTIGACAO-TECNICA-COMPRA-PLANO-ATIVACAO-CONTA.md` — fluxo `plan-purchase`.
- `docs/RELATORIO-FLUXO-CONTRATACAO-PLANO-SAAS.md` — detalhe de `users_count` e controller.

---

## 7. Resumo executivo

O checkout já centraliza **pagamento** e cria **tenant + admin placeholder** via `plan-purchase`. Os fluxos paralelos (`/register` wizard e `signUp` em `/api/auth/register`) criam contas **sem** depender desse fluxo. O trabalho principal é **reorganizar etapas e campos no `PlanCheckout`**, **alinhar backend** (senha, WhatsApp, unicidade, posição do CPF/CNPJ) e **redirecionar ou desativar** os outros pontos de cadastro, com cuidado para não quebrar trial grátis e onboarding existente.
