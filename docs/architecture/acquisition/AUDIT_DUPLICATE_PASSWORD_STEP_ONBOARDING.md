# Auditoria Read-Only — Duplicação da etapa de senha no onboarding

**Data:** 2026-06-02  
**Escopo:** mapeamento do fluxo atual (sem alteração de código, migrations ou correções).  
**Contexto relatado:** após mover a “criação da conta” para a etapa **Empresa** (P0-C — identidade/slug oficial), o usuário vê **senha duas vezes**.

---

## Resumo executivo

| Pergunta | Resposta |
|----------|----------|
| Por que a senha aparece duas vezes? | Há **duas telas de UI** no fluxo acquisition trial: (1) sub-etapa **credenciais** do `/cadastro` e (2) etapa **`provision`** do `/onboarding/acquisition`. A etapa **Empresa** **não** exibe senha. |
| Arquivo principal da 2ª tela | `src/pages/AcquisitionOperationalOnboarding.tsx` (`displayStep === 'provision'`) |
| Arquivo principal da 1ª tela | `src/pages/AcquisitionSignupFlow.tsx` + `OnboardingCredentialsCapture.tsx` |
| É duplicação de UI? | **Sim** — dois formulários distintos. |
| É duplicação de estado (wizard)? | **Parcial** — `completed_steps` não inclui `provision`; a senha do cadastro fica só em `sessionStorage`. |
| É duplicação de criação de usuário? | **Não** — `password_hash` é criado **uma vez**, em `provisionWorkspaceFromSession`. |
| É problema de resume? | **Pode reforçar** a sensação (retomada no `/cadastro` → credenciais de novo; sessão sem `tenant_id` → `provision` de novo), mas a causa raiz é **dois pontos de coleta** no desenho atual. |
| Correção de menor risco (recomendação) | **Remover senha do cadastro** e manter só em `provision` **ou** eliminar UI de senha em `provision` e enviar a senha já coletada no cadastro para `POST .../onboarding/provision` (uma coleta, um `createTenantAdminUser`). |

**Esclarecimento P0-C:** a mudança “conta na Empresa” no produto refere-se sobretudo à **identidade operacional** (nome/slug/logos em `completeWizardCompanyStep`), não à criação do `users.password_hash`. O **tenant + admin** continuam sendo criados na etapa **`provision`** (antes da Empresa), com nome/slug provisórios (`Minha operação` / `minha-operacao`).

---

## 1. Fluxo completo do onboarding

### 1.1 Visão em camadas

```mermaid
flowchart TD
  subgraph cadastro["/cadastro — AcquisitionSignupFlow"]
    L0[lead / identity: nome + telefone]
    L1[lead / credentials: e-mail + senha]
    P[plan: plano + usuários]
    C[conversion: ativar trial ou pagamento]
    L0 --> L1 --> P --> C
  end

  subgraph prep["Backend — sem tenant"]
    CAP[POST contact/capture]
    RES[POST contact/resolve]
    SS[POST signup/step]
    AT[POST activate/trial]
    CAP --> RES --> SS
    SS --> P
    P --> AT
  end

  subgraph op["/onboarding/acquisition — AcquisitionOperationalOnboarding"]
    PR[provision: senha — CRIA tenant + user]
    CO[company: empresa + slug oficial]
    US[users: equipe — opcional]
    WA[whatsapp]
    SU[summary / completed]
    PR --> CO --> US --> WA --> SU
  end

  subgraph dash["Destino"]
    D[/dashboard]
  end

  L0 --> CAP
  L1 --> RES
  C --> AT
  AT -->|redirect ?session=| PR
  SU --> D
```

### 1.2 Cadastro público (`/cadastro`)

| Ordem | Step ID (UI) | Sub-etapa | Componente | Entrada | Saída |
|------:|--------------|-----------|------------|---------|-------|
| 1 | `lead` | `identity` | `ContactSetupStep` → `OnboardingIdentityCapture` | `enabled === true` (flag `signup_flow_v1`) | `POST /api/public/acquisition/contact/capture` → `leadSubStep = credentials` |
| 2 | `lead` | `credentials` | `ContactSetupStep` → `OnboardingCredentialsCapture` | após capture OK | `POST /contact/resolve` + `POST /signup/step` (`step: contact`) → `saveSignupCredentialDraft` → `stepIndex = 1` |
| 3 | `plan` | — | `OperationSetupStep` | `stepIndex === 1` | `POST /signup/step` (`step: plan`) → `stepIndex = 2` |
| 4 | `conversion` | — | `ActivationWelcomeStep` ou `OnboardingConversionStep` | trial ou checkout | trial: `POST /activate/trial` → redirect onboarding; pagamento: `POST /plan-purchase` + token |

**Arquivo orquestrador:** `src/pages/AcquisitionSignupFlow.tsx`  
**Steps:** `WIZARD_STEP_IDS = ['lead', 'plan', 'conversion']`  
**Resume URL:** `resolveWizardStepFromLead` / `normalizeResumeNavigation` (`src/lib/acquisitionSignupResume.ts`)

### 1.3 Onboarding operacional (`/onboarding/acquisition?session=…`)

| Ordem real (trial) | `displayStep` | `wizard.current_step` (API) | Componente / bloco | Entrada | Saída |
|-------------------:|---------------|------------------------------|------------------|---------|-------|
| 0 | **`provision`** | forçado `provision` se `!session.tenant_id` | `ProvisionMobilePasswordForm` + inputs desktop em `AcquisitionOperationalOnboarding` | `needs_provision === true` após `GET .../onboarding/wizard/:token` | `POST /api/public/acquisition/onboarding/provision` → `setTokenAndUser`, `needsProvision = false`, `loadWizard()` |
| 1 | `company` | `company` | `CompanyStepMainForm` / `OperationalCompanyCard` | `tenant_id` definido | `POST /api/onboarding/wizard/company` (auth) |
| 2 | `users` (se `users_count > 1`) | `users` | `TeamStepMainForm` | `teamStepEnabled` | `POST /api/onboarding/wizard/users` |
| 3 | `whatsapp` | `whatsapp` | wizard WhatsApp | após company/users | `POST` complete/skip whatsapp |
| 4 | `summary` / `completed` | `completed` | `OperationalSummaryStep` / `OperationReadyStep` | kickoff completo | `navigate('/dashboard')` |

**Arquivo orquestrador:** `src/pages/AcquisitionOperationalOnboarding.tsx`  
**Lógica de passo:**

```ts
// serverStep quando tenant ainda não existe
const serverStep = needsProvision ? 'provision' : (wizard?.current_step ?? 'company');
```

**Backend — derivação do passo:** `buildWizardStatePayload` em `packages/backend/src/acquisition/acquisitionOnboardingWizardService.ts`:

- Se `!session.tenant_id` → `current_step = 'provision'` (independente do valor gravado na sessão).
- Ordem oficial pós-provision: `company` → `users` (condicional) → `whatsapp` → `completed` (`onboardingWizardTypes.ts`).

**Rail visual (Empresa / Equipe / WhatsApp):** `OPERATIONAL_WIZARD_STEPS` em `src/components/onboarding/wizard/constants.ts` — **não inclui `provision`**, que é etapa “pré-jornada” só na página operacional.

### 1.4 Onboarding legado (`/onboarding`)

| Rota | Uso no fluxo acquisition trial | Senha |
|------|--------------------------------|-------|
| `/onboarding` (`Onboarding.tsx`) | Não é o destino do trial acquisition (`redirectPath` aponta para `/onboarding/acquisition`) | `POST /api/onboarding/create-admin` — fluxo **legado** pós-pagamento |

### 1.5 Conclusão

- **Empresa** = identidade (nome, slug, logos); **não** pede senha hoje.
- **Provision** = criação de tenant + usuário admin + `password_hash` (ainda **antes** da Empresa).
- A expectativa “conta criada na Empresa” **não corresponde** ao código atual de criação de usuário.

---

## 2. Onde a senha é solicitada

### 2.1 Fluxo acquisition (relevante ao bug)

| # | Arquivo | Função / bloco | Condição de exibição | Persistência / efeito |
|---|---------|----------------|----------------------|------------------------|
| 1 | `src/components/acquisition/onboarding/OnboardingCredentialsCapture.tsx` | render inputs | `ContactSetupStep` com `subStep === 'credentials'` | Validação local; **não** grava `password_hash` |
| 2 | `src/pages/AcquisitionSignupFlow.tsx` | `validateLeadCredentialsStep`, `handleNext` (lead + credentials) | após identity capture | `saveSignupCredentialDraft(leadId, password)` → `sessionStorage` |
| 3 | `src/lib/acquisitionSignupCredentialDraft.ts` | `save` / `load` | chave `acquisition_signup_credential_draft` | Só browser; **não** vai ao backend no cadastro |
| 4 | `src/pages/AcquisitionOperationalOnboarding.tsx` | `isProvisionStep`, `handleProvision` | `needsProvision && !tenant_id` | `POST .../onboarding/provision` com `password` |
| 5 | `src/components/onboarding/wizard/provision-mobile/ProvisionMobilePasswordForm.tsx` | UI mobile | `displayStep === 'provision'` | Mesmo estado `password` / `confirmPassword` da página |
| 6 | `src/pages/AcquisitionOperationalOnboarding.tsx` | `loadWizard` | após GET wizard, se `lead.id` | **Preenche** senha do draft → reforça sensação de “de novo” |

### 2.2 Backend — exigência e validação de senha

| Arquivo | Função | Condição |
|---------|--------|----------|
| `packages/backend/src/controllers/acquisitionController.ts` | `postProvisionOnboarding` | `provisionSchema`: `password` min 6 |
| `packages/backend/src/acquisition/acquisitionProvisioningService.ts` | `provisionWorkspaceFromSession` | `input.password` → `createTenantAdminUser` |
| `packages/backend/src/services/tenantAdminService.ts` | `createTenantAdminUser` | `hashPassword` → `INSERT users.password_hash` |
| `packages/backend/src/acquisition/onboardingWizardValidation.ts` | `wizardUsersBodySchema` | `password` opcional **por membro** da equipe (não admin principal) |
| `packages/backend/src/acquisition/acquisitionOnboardingWizardService.ts` | `completeWizardUsersStep` | senha aleatória se membro sem password |

### 2.3 Verificação de `password_hash` / usuário existente

| Arquivo | Função | Uso |
|---------|--------|-----|
| `packages/backend/src/controllers/authController.ts` | login | `comparePassword` vs `password_hash`; erro se hash ausente |
| `packages/backend/src/acquisition/acquisitionProvisioningService.ts` | `provisionWorkspaceFromSession` | `ALREADY_PROVISIONED` se `session.tenant_id` ou `lead.tenant_id` |
| `packages/backend/src/controllers/onboardingController.ts` | `postOnboardingCreateAdmin` | atualiza hash de admin **já existente** (legado) |

### 2.4 Outros pontos (fora do trial acquisition, listados por completude)

| Arquivo | Contexto |
|---------|----------|
| `src/pages/Login.tsx` | login |
| `src/pages/ForgotPasswordWhatsapp.tsx` | recuperação |
| `src/pages/Onboarding.tsx` | onboarding legado 3 passos |
| `src/pages/AcquisitionOperationalOnboarding.tsx` | único ponto acquisition que **cria** hash |

---

## 3. Criação da conta

### 3.1 Onde o usuário admin é criado (fluxo trial acquisition)

| Momento | Serviço | O que cria |
|---------|---------|------------|
| **Provision** (`POST /api/public/acquisition/onboarding/provision`) | `provisionWorkspaceFromSession` | `tenants`, `users` (+ `password_hash`), `profiles`, permissões bootstrap, `acquisition_onboarding_sessions.tenant_id`, atualiza `acquisition_leads.tenant_id` |
| **Empresa** (`POST /api/onboarding/wizard/company`) | `completeWizardCompanyStep` | Atualiza `tenants.name`, `tenants.slug`, logos, `profiles.company_name` — **não** cria usuário |
| **Equipe** (`POST /api/onboarding/wizard/users`) | `completeWizardUsersStep` | Insere **outros** `users` (membros), não o admin inicial |

### 3.2 Preparação do trial (antes do onboarding)

| Endpoint | Serviço | Tenant / user |
|----------|---------|---------------|
| `POST /api/public/acquisition/activate/trial` | `prepareAcquisitionTrialActivation` | **Não** cria tenant nem user; cria `acquisition_onboarding_sessions` (`tenant_id = null`, `deferred_provisioning: true` nos logs) |

### 3.3 Quantos lugares podem criar tenant + admin no produto

| Fluxo | Cria tenant + admin? |
|-------|----------------------|
| Acquisition trial (provision) | Sim — **1 vez** por sessão |
| `POST /api/plan-purchase/complete-signup-trial` | Sim (checkout legado) |
| `POST /api/plan-purchase` (pagamento no cadastro) | Sim, com token |
| `authController.register` | Sim (registro antigo) |
| `registerOrganizationController` | Sim |
| `onboardingController.postOnboardingCreateAdmin` | Fallback cria admin se não existir (legado) |

**Resposta direta:** no fluxo acquisition trial analisado, a conta admin é criada em **um único lugar** (`provisionWorkspaceFromSession`). Não há segundo `createTenantAdminUser` na etapa Empresa.

### 3.4 `onboarding_session` após provision

```text
attachTenantToSession(session.id, tenantId)
updateOnboardingWizardSession({
  current_step: 'company',
  completed_steps: [],
  activation_progress: 0,
  resume_step: 1,
})
```

Senha já foi consumida; sessão segue para Empresa **sem** marcar `provision` em `completed_steps` (tipo existe em `OnboardingWizardStepId` mas não entra em `WIZARD_STEP_ORDER`).

---

## 4. Resume / Rehydration

### 4.1 Cadastro — `resolveWizardStepFromLead`

| `current_stage` (lead) | Sem `?step=` na URL | Com `?step=` |
|------------------------|---------------------|--------------|
| `contact_captured` | índice **1** (plano) | conforme URL |
| `plan_selected` / `activation_prepared` / `checkout_started` | 2 se tem plano, senão 1 | normalizado |
| default | 0 (lead) | `resolveWizardStepIndex` |

**Sub-etapa senha no cadastro:** ao reidratar lead com e-mail real (`GET /leads/:id`), o front faz `setLeadSubStep('credentials')` se o e-mail não for placeholder `pending+…@signup.painelcrm.local` — usuário pode ver **e-mail + senha outra vez** mesmo já tendo preenchido antes (senha só estava no `sessionStorage`).

### 4.2 `resolveAcquisitionResume` (backend)

| `current_stage` | Destino típico |
|-----------------|----------------|
| `onboarding_in_progress` / `onboarding_kickoff` | `/onboarding/acquisition?session=…` se sessão acessível |
| `contact_captured` | `/cadastro?lead=…&step=plan` |
| `converted` | `/login` |

Não referencia explicitamente “senha concluída” — não há flag `password_captured` no lead.

### 4.3 Wizard operacional após reload

| Estado DB | `needs_provision` | UI |
|-----------|-------------------|-----|
| `tenant_id IS NULL` | `true` | **`provision`** (senha) de novo |
| `tenant_id` preenchido | `false` | `company` / `users` / `whatsapp` |

**Cenário “senha concluída mas reaparece”:**

1. Usuário preenche senha no **cadastro** → nada no DB indica isso.  
2. Usuário preenche senha no **provision** → `password_hash` existe.  
3. Reload em `/onboarding/acquisition` com `tenant_id` → **não** mostra provision (OK).  
4. Reload se provision falhou / sessão sem tenant / outra aba sem token → **mostra provision** de novo (esperado).  
5. Retomada em `/cadastro` com lead que já tem e-mail → sub-etapa **credentials** de novo (UI duplicada com cadastro, não com Empresa).

**`onboarding_session.current_step`:** gravado como `company` após provision, mas enquanto `tenant_id` é null o payload API **sempre** expõe `provision` via `buildWizardStatePayload`.

---

## 5. Timeline — novo cadastro (trial)

Fluxo: **Nome → Telefone → (E-mail + Senha) → Plano → Ativar trial → … → Dashboard**

| Passo | Ação usuário | Endpoint | Alteração principal no banco | Próximo passo |
|------:|--------------|----------|------------------------------|---------------|
| 1 | Nome + telefone | `POST /api/public/acquisition/contact/capture` | `acquisition_leads` insert/update; e-mail placeholder `pending+{fone}@signup.painelcrm.local`; evento ops kanban | credentials no cadastro |
| 2 | E-mail + senha | `POST /api/public/acquisition/contact/resolve` | `acquisition_leads.email` finalizado; metadados | `POST /api/public/acquisition/signup/step` |
| 2b | (auto) | `POST /signup/step` `step: contact` | stage `contact_captured`; outbox signup | plano |
| 3 | Escolhe plano | `POST /signup/step` `step: plan` | `selected_plan_id`, stage `plan_selected` | conversão |
| 4 | Iniciar avaliação | `POST /api/public/acquisition/activate/trial` | `acquisition_onboarding_sessions` (sem `tenant_id`); lead `onboarding_in_progress`; **sem** `users` | redirect `/onboarding/acquisition?session=` |
| 5 | **Senha (provision)** | `POST /api/public/acquisition/onboarding/provision` | **`tenants`**, **`users.password_hash`**, profiles, `session.tenant_id`, lead.`tenant_id`, slug provisório | `GET /api/public/acquisition/onboarding/wizard/:token` |
| 6 | Empresa (nome + slug) | `POST /api/onboarding/wizard/company` | `tenants.name/slug`, logos, notificações P0-C adiadas | equipe ou WhatsApp |
| 7 | Equipe (opcional) | `POST /api/onboarding/wizard/users` | membros `users` | WhatsApp |
| 8 | WhatsApp | wizard whatsapp routes | instância / skip | completed / summary |
| 9 | Dashboard | navegação front | `session.status = completed` (kickoff) | `/dashboard` |

**Observação:** a senha coletada no passo 2 **não** participa do passo 5 no backend — só o draft no browser pode pré-preencher o formulário de provision (`loadSignupCredentialDraft`).

---

## 6. Critério final

### Por que a senha aparece duas vezes?

Porque o produto passou a coletar senha no **cadastro** (sub-etapa `credentials`, alteração recente), **sem remover** a etapa **`provision`** do onboarding operacional, que é onde o sistema **realmente** exige senha para `createTenantAdminUser`. A etapa **Empresa** não duplica senha; confunde-se com “criação da conta” porque é onde a **identidade oficial** da operação é definida (P0-C), mas o **login** já foi criado um passo antes.

### Qual arquivo é o responsável pela segunda tela?

- **Principal:** `src/pages/AcquisitionOperationalOnboarding.tsx` (`isProvisionStep`, `handleProvision`).  
- **Primeira tela:** `src/pages/AcquisitionSignupFlow.tsx` + `OnboardingCredentialsCapture.tsx`.  
- **Ponte visual:** `src/lib/acquisitionSignupCredentialDraft.ts` (pré-preenche a segunda tela).

### Classificação

| Tipo | Veredito |
|------|----------|
| Duplicação de UI | **Sim** (cadastro + provision) |
| Duplicação de estado wizard | **Não** para senha (não há step “senha” persistido); provision não está em `completed_steps` |
| Duplicação de criação de usuário | **Não** (um `createTenantAdminUser` no provision) |
| Problema de resume | **Secundário** (pode reexibir credentials ou provision em retomadas) |
| Duplicação na etapa Empresa | **Não** |

### Correções de menor risco (somente recomendação — fora do escopo desta auditoria)

1. **Menor diff / menor risco de regressão de auth:** remover campos de senha do cadastro (`OnboardingCredentialsCapture` + validação + `saveSignupCredentialDraft`) e manter **apenas** `provision` como coleta única que grava hash.  
2. **Melhor UX alinhada ao cadastro atual:** manter senha só no cadastro; em `handleProvision` enviar senha do draft (ou corpo já validado) e **substituir** o formulário de provision por CTA “Criar operação” sem inputs de senha (provision continua no backend).  
3. **Alinhar narrativa P0-C ao código:** mover `createTenantAdminUser` + senha para o fim de `completeWizardCompanyStep` e fazer `provision` apenas criar tenant vazio ou ser eliminado — **maior** mudança transacional, não é a menor.

---

## Referências de código (âncoras)

| Tópico | Caminho |
|--------|---------|
| Forçar passo provision | `packages/backend/src/acquisition/acquisitionOnboardingWizardService.ts` — `buildWizardStatePayload` |
| Criação tenant + admin | `packages/backend/src/acquisition/acquisitionProvisioningService.ts` — `provisionWorkspaceFromSession` |
| Trial sem provision | `packages/backend/src/acquisition/acquisitionActivationPrepareService.ts` — `prepareAcquisitionTrialActivation` |
| Empresa sem senha | `packages/backend/src/acquisition/acquisitionOnboardingWizardService.ts` — `completeWizardCompanyStep` |
| Draft senha browser | `src/lib/acquisitionSignupCredentialDraft.ts` |
| Resume cadastro | `src/lib/acquisitionSignupResume.ts` |
| Resume lead | `packages/backend/src/acquisition/acquisitionResumeService.ts` |
| Auditoria provision tardio | `docs/architecture/POST_ONBOARDING_ACTIVATION_AUDIT.md` §2.1 |

---

*Documento gerado em modo read-only conforme solicitado.*
