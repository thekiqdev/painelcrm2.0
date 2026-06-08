# Sprint P0-F.1 — Nome da operação em notificações de Trial

## Problema

Após concluir o onboarding, duas mensagens WhatsApp exibiam nomes diferentes:

| # | Template | Exemplo observado |
|---|----------|-------------------|
| 1 | `platform.account.created` | "A conta **Criar Loja** foi criada…" (correto) |
| 2 | `platform.trial.started` | "O teste grátis… começou para **Minha operação**" (incorreto) |

## Causa raiz

| Mensagem | Disparo (antes) | Origem de `tenant.name` |
|----------|-----------------|-------------------------|
| **1** | `completeWizardCompanyStep` → `schedulePublishPlatformAccountCreated` | `SELECT name, slug FROM tenants` no envio + **defer** se slug/nome provisório |
| **2** | `provisionWorkspaceFromSession` → `schedulePublishPlatformTrialStarted` | `loadPrimaryTenantAdminForNotify` → `t.name` ainda **"Minha operação"** (provision antes do Company Step) |

Fluxo acquisition:

1. **Provision** — cria `tenants.name` / `slug` provisórios (`Minha operação` / `minha-operacao-*`).
2. **Company Step** — persiste identidade oficial (`tenants.name`, `tenants.slug`, `profiles.company_name`).
3. Mensagem 1 já esperava o passo 2; mensagem 2 disparava no passo 1.

## Mapeamento técnico

### Mensagem 1 — "A conta {empresa} foi criada"

| Camada | Artefato |
|--------|----------|
| Controller | `acquisitionOnboardingWizardController` → `POST …/wizard/company` |
| Service | `completeWizardCompanyStep` (`acquisitionOnboardingWizardService.ts`) |
| Scheduler | `schedulePublishPlatformAccountCreated(tenantId)` |
| Publisher | `publishPlatformAccountCreated` (`platformBusinessNotifications.ts`) |
| Template SQL | `database/init/142_platform_notifications_trial_and_template_refresh.sql` — `platform.account.created` / WhatsApp pt-BR |
| Merge field | `tenant.name` ← `loadOfficialTenantIdentityForNotify` (DB) |

### Mensagem 2 — "O teste grátis começou para {empresa}"

| Camada | Artefato (antes) | Artefato (depois) |
|--------|------------------|-------------------|
| Controller | `provision` (onboarding operacional) | — |
| Service (disparo) | `acquisitionProvisioningService.ts` | `completeWizardCompanyStep` (junto com msg 1) |
| Scheduler | `schedulePublishPlatformTrialStarted` no provision | Mesmo bloco que `account.created`, se `tenant.status === 'trial'` e primeira conclusão de `company` |
| Publisher | `publishPlatformTrialStarted` | + `loadOfficialTenantIdentityForNotify` (defer se provisório) |
| Template SQL | `142_…sql` — `platform.trial.started` | idem |
| Merge field | `admin.tenant_name` (stale) | `official.name` do banco |

## Correção aplicada

1. **Removido** `schedulePublishPlatformTrialStarted` de `acquisitionProvisioningService.ts`.
2. **Adicionado** `schedulePublishPlatformTrialStarted` em `completeWizardCompanyStep`, nas mesmas condições de `schedulePublishPlatformAccountCreated`.
3. **Helper** `loadOfficialTenantIdentityForNotify` — leitura fresca de `tenants.name` / `tenants.slug` + `isProvisionalOperationalName` / `isProvisionalOperationalSlug`.
4. **`publishPlatformTrialStarted`** usa `official.name` em `tenant.name` (não mais só `admin.tenant_name`).

## Constantes provisórias

Definidas em `packages/backend/src/acquisition/tenantOperationalSlug.ts`:

- `PROVISIONAL_COMPANY_NAME` = `"Minha operação"`
- `PROVISIONAL_SLUG_BASE` = `"minha-operacao"` (sufixo numérico permitido: `minha-operacao-2`, …)

Não existe `DEFAULT_OPERATION_NAME` no código; o front envia literal `'Minha operação'` no provision.

## Auditoria complementar — outros usos

### Acquisition / onboarding (esperado provisório até Company Step)

| Recurso | Arquivo | Notas |
|---------|---------|-------|
| Provision API body | `src/pages/AcquisitionOperationalOnboarding.tsx` | `company_name: 'Minha operação'` até empresa definida |
| UI fallback | idem | `companyName \|\| 'Minha operação'` |
| Tenant + slug no DB | `acquisitionProvisioningService.ts` | Nome do payload de provision; substituído em `completeWizardCompanyStep` |
| Defer notificações | `platformBusinessNotifications.ts` | `account.created` e `trial.started` não enviam com nome/slug provisório |

### Notificações plataforma (outros fluxos — nome real na criação)

| Fluxo | Disparo trial.started | Risco P0-F.1 |
|-------|----------------------|--------------|
| Cadastro legado `authController` | Após registro com nome informado | Baixo — tenant já tem nome final |
| `registerOrganizationController` | Idem | Baixo |
| `planPurchaseController` | Pós-compra trial | Baixo — tenant existente |
| `tenantsController` | Só `account.created` | N/A |
| `trial.ended` / `trial.expiring` | Jobs / subscription | Usa `admin.tenant_name`; tenant já maduro |
| Billing / plan activated | Pós-pagamento | Tenant maduro |

Recomendação futura (fora do escopo): alinhar **todos** os eventos `platform.*` que usam `tenant.name` ao helper oficial para tenants que passaram por provision acquisition.

### Activation center / ops / outbox

| Área | Uso de nome provisório |
|------|------------------------|
| Ops Kanban lead | Título do lead na captura (nome da pessoa), não "Minha operação" |
| `notifySuperAdminsNewTenant` | Chamado em Company Step com `name` oficial |
| Activation tracking | Metadados de sessão; não templates WhatsApp de trial |
| Outbox `onboarding.company.completed` | Metadata com `company_name` oficial |

### E-mail / WhatsApp tenant (motor do tenant)

Motor `businessTransactionalNotifications` e templates de proposta/contrato usam `t.name` do banco no momento do evento — independente do fluxo acquisition.

### Superadmin / suporte

| Recurso | Texto |
|---------|-------|
| Template suporte WhatsApp | "Minha empresa é {{tenant_name}}" — placeholder, não "Minha operação" |
| `platformSupportWhatsapp.ts` | Fallback `minha empresa` se vazio |

### Chatbot / webhooks / instâncias

Nenhum template de produto encontrado com literal "Minha operação" além do provision acquisition e constantes `tenantOperationalSlug`.

## Critério de aceite

Novo onboarding com empresa **Criar Loja**:

1. "A conta **Criar Loja** foi criada na PainelCRM."
2. "O teste grátis da PainelCRM começou para **Criar Loja**."

Não deve aparecer: Minha operação, minha-operacao, slug temporário em notificações pós–Company Step.

## Verificação manual

1. Fluxo signup → provision → wizard → concluir **Identidade da operação** com nome real.
2. Confirmar duas mensagens WhatsApp com o mesmo `tenant.name`.
3. Logs: ausência de `platform_business_defer_trial_started` após company step; se aparecer antes, trial não deve ter sido enviado com nome provisório.

## Arquivos alterados

- `packages/backend/src/acquisition/acquisitionProvisioningService.ts`
- `packages/backend/src/acquisition/acquisitionOnboardingWizardService.ts`
- `packages/backend/src/services/platformNotifications/platformBusinessNotifications.ts`
