# Arquitetura enterprise — PainelCRM SaaS

Documentação **oficial de arquitetura** (planejamento e implementação futura), separada de `docs/` operacional (backlogs, investigações, fixes, changelogs).

## Documentos raiz

| Documento | Descrição |
|-----------|-----------|
| **[`IMPLEMENTATION_ROADMAP_AND_ROLLOUT_STRATEGY.md`](./IMPLEMENTATION_ROADMAP_AND_ROLLOUT_STRATEGY.md)** | **Ponte arquitetura → produção: fases 0–9, rollout, flags, coexistência, governança** |
| [`ARCHITECTURE_SYSTEM_CONTEXT_MAP.md`](./ARCHITECTURE_SYSTEM_CONTEXT_MAP.md) | Bounded contexts, eventos, ownership, fronteiras transacionais |
| [`MASTER_PLAN_SIGNUP_TRIAL_ONBOARDING_CONVERSION.md`](./MASTER_PLAN_SIGNUP_TRIAL_ONBOARDING_CONVERSION.md) | Plano mestre: aquisição, trial, onboarding, communication platform, operação em escala (AS-IS/TO-BE detalhado) |

## Estrutura de pastas (documentação futura)

| Pasta | Conteúdo previsto |
|-------|-------------------|
| [`acquisition/`](./acquisition/) | Signup, checkout, recovery, sagas |
| [`communication/`](./communication/) | Gateway, providers, Meta Cloud API, webhooks |
| [`communication/COMMUNICATION_PLATFORM_ARCHITECTURE.md`](./communication/COMMUNICATION_PLATFORM_ARCHITECTURE.md) | **Gateway, adapters, webhooks, templates, policy, Meta-ready** |
| [`billing/`](./billing/) | Fronteiras billing ↔ plataforma (complementa docs operacionais em `../`) |
| [`onboarding/`](./onboarding/) | Onboarding engine, activation, first value |
| [`onboarding/ONBOARDING_ENGINE_ARCHITECTURE.md`](./onboarding/ONBOARDING_ENGINE_ARCHITECTURE.md) | **Engine, score, first value, recovery, workflows** |
| [`analytics/`](./analytics/) | Funil, health score, product analytics |
| [`automation/`](./automation/) | Orchestrator, jobs, workflows |
| [`automation/DOMAIN_EVENT_AND_OUTBOX_ARCHITECTURE.md`](./automation/DOMAIN_EVENT_AND_OUTBOX_ARCHITECTURE.md) | **Outbox, event bus, idempotência, workers** |
| [`automation/AUTOMATION_ORCHESTRATOR_ARCHITECTURE.md`](./automation/AUTOMATION_ORCHESTRATOR_ARCHITECTURE.md) | **Workflow engine, scheduling, retries, saga coordination** |
| [`observability/`](./observability/) | Audit, correlation, dashboards, retenção |
| [`runbooks/`](./runbooks/) | Playbooks operacionais (aquisição, comunicação) |
| [`future/`](./future/) | IA, omnichannel, multi-produto, escalabilidade |

## Documentação operacional (fora desta pasta)

Permanece em `docs/` na raiz: investigações, planos por módulo legado, billing operacional, platform-notifications, backlogs, etc.

Exemplos relacionados:

- [`../BILLING_RECOVERY_ENGINE.md`](../BILLING_RECOVERY_ENGINE.md)
- [`../BILLING_NOTIFICATION_HARDENING.md`](../BILLING_NOTIFICATION_HARDENING.md)
- [`../PLANO-MESTRE-FLUXO-CONTRATACAO-NOVAS-EMPRESAS.md`](../PLANO-MESTRE-FLUXO-CONTRATACAO-NOVAS-EMPRESAS.md)

---

*Não implementar código com base apenas nestes documentos sem sign-off P0.*
