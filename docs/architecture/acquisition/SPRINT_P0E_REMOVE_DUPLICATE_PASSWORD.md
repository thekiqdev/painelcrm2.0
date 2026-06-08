# Sprint P0-E — Remover duplicação da senha no onboarding

## Objetivo

Senha coletada **uma vez** em `/cadastro` (sub-etapa credenciais); provision operacional usa o draft sem reexibir formulário.

## Implementação

| Item | Detalhe |
|------|---------|
| Draft | `getSignupCredentialDraft(leadId)` em `src/lib/acquisitionSignupCredentialDraft.ts` |
| Auto-provision | `AcquisitionOperationalOnboarding.tsx` — `useEffect` chama `POST .../onboarding/provision` quando `needs_provision` + draft válido |
| UI senha | `showProvisionPasswordUi` — só se sem draft ou fallback após falha do auto-provision |
| Silencioso | `isAutoProvisioning` — loader “Preparando sua operação” + trilho Empresa |
| Fallback | `provisionManualFallback` — sessões antigas ou erro no auto-provision |
| Limpeza | `clearSignupCredentialDraft()` após provision OK |

## Testes manuais

1. **Novo cadastro** — credenciais no cadastro → ativar trial → onboarding vai direto para Empresa (sem senha).
2. **Refresh** — com `tenant_id` na sessão, não volta ao provision.
3. **Sem draft** — abrir onboarding sem `sessionStorage` draft → tela provision com senha.
4. **Tenant** — após fluxo, login com e-mail/senha do cadastro.

## Testes automatizados

`src/lib/acquisitionSignupCredentialDraft.test.ts` (vitest).

## Referência

Auditoria: `AUDIT_DUPLICATE_PASSWORD_STEP_ONBOARDING.md`
