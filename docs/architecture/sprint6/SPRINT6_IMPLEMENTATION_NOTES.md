# Sprint 6 — Acquisition + Signup + Trial Orchestration

## Escopo

Motor de aquisição enterprise (pré-cadastro, signup coexistente, `/teste-gratis`, recovery, activation tracking, onboarding kickoff) **sem** alterar signup/checkout/billing/provisioning legados.

## Componentes

| Área | Caminho |
|------|---------|
| Migration | `258_acquisition_foundation_p0.sql` |
| Domain | `packages/backend/src/acquisition/` |
| API pública | `/api/public/acquisition/*` |
| Frontend | `/teste-gratis`, `/cadastro`, `/onboarding/kickoff` |

## Tabelas

- `acquisition_leads` — funil pré-cadastro
- `acquisition_activation_events` — tracking foundation

## Fluxos

### Legado (default prod)
- `/register`, `/checkout` — inalterados

### Novo (flags OFF = fallback para legado)
1. **Pré-cadastro** → `acquisition_leads`
2. **Signup steps** → `/cadastro` → checkout legado com `?lead=`
3. **Teste grátis** → `/teste-gratis` → trial plan + kickoff shadow → checkout legado

## Workflows (shadow)

- `acquisition.signup.started`
- `acquisition.checkout.abandoned`
- `acquisition.trial.recovery`
- `onboarding.kickoff`
- `onboarding.first_access`

## Flags (default OFF)

- `acquisition.pre_signup_v1`
- `acquisition.signup_flow_v1`
- `acquisition.trial_flow_v1`
- `acquisition.recovery_v1`
- `acquisition.activation_tracking_v1`
- `acquisition.activation_score_v1`
- `acquisition.onboarding_kickoff_v1`
- Kill: `acquisition.master_off`

## Communication

`onboardingKickoffService` → `sendTransactionalMessage()` via gateway (shadow por default).

## Recovery

- Cooldown: `ACQUISITION_RECOVERY_COOLDOWN_HOURS` (default 24h)
- Suppression via `metadata.recovery_suppressed`
- Jobs throttled em `automation_jobs` (shadow)

## Rollback

1. `acquisition.master_off` ON
2. Frontend mostra fallback para `/register` ou `/checkout`
3. Tabelas inertes

## Fora de escopo

Onboarding visual completo, AI, SDR real, campaigns, provisioning rewrite.

## Testes

`packages/backend/src/acquisition/acquisition.test.ts`
