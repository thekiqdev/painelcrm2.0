# Sprint P0-E.1.1 — Persistência do credential draft

## Mudanças

### Cadastro (`AcquisitionSignupFlow.tsx`)

- `persistCredentialDraftForLead()` após `validateLeadCredentialsStep()` — **antes** de `contact/resolve`.
- Re-save quando `resolve` retorna `lead_id`.
- Re-save em `continue_lead` / `reactivation_eligible` antes de qualquer `navigate`.
- Re-save após `postSignupStep('contact')`.

### Onboarding (`AcquisitionOperationalOnboarding.tsx`)

- `inspectCredentialDraft` + `resolveProvisionPasswordUiState` para reason codes permanentes.
- Atributo DOM: `data-provision-password-ui-reason` (`hidden` | `draft_missing` | … | `auto_provisioning`).
- `ALREADY_PROVISIONED` no auto-provision → `loadWizard()` sem tela de senha.
- `strict_mode_retry` após 2ª falha de auto-provision (StrictMode dev).

### Lib (`acquisitionSignupCredentialDraft.ts`)

Reason codes: `draft_missing`, `lead_id_mismatch`, `draft_invalid`, `provision_failed`, `already_provisioned`, `strict_mode_retry`, `hidden`.

Persistência em `sessionStorage`: `acquisition_provision_password_ui_reason`.

## Testes automatizados

`src/lib/acquisitionSignupCredentialDraft.test.ts`

## Testes manuais

| Cenário | Esperado |
|---------|----------|
| Novo cadastro completo | Auto-provision → Empresa, `data-provision-password-ui-reason=hidden` |
| `continue_lead` | Draft salvo antes do redirect → sem senha no onboarding |
| `reactivation_eligible` | Idem |
| Refresh onboarding (tenant ok) | Sem provision |
| Nova aba (mesmo origin) | Draft no sessionStorage → auto-provision |
| Sessão antiga sem draft | `draft_missing` + tela senha |
