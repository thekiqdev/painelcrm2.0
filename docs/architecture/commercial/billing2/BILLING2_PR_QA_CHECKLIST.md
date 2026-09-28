# Billing 2.0 — Template PR / QA (Sprint+)

Usar em **toda** Pull Request e ao fechar cada Sprint do Implementation Plan.

## Cabeçalho da PR

```text
Billing 2.0 — Sprint N — <título curto>

PRD: v1.1 (sem alteração de regras neste PR? sim/não)
Implementation Plan: v1.0 — Sprint N
Feature flags tocadas: <lista ou nenhuma>
```

## Checklist — Princípios do Produto (PRD §17)

- [ ] **Compatibilidade:** clientes existentes / fluxo atual não quebram com flags default
- [ ] **Configuração > código:** comportamento novo controlável por flag/config (ou documentado como exceção)
- [ ] **Automação desligável:** existe Feature Flag / toggle equivalente
- [ ] **Cobrança não se perde:** há audit/retry/reconciliação quando aplicável (ou N/A Sprint 0)
- [ ] **Auditável:** mutações financeiras têm actor/data/motivo/origem/entidade/correlation_id (ou N/A)
- [ ] **Cérebro = PainelCRM:** gateway só executa
- [ ] **Multi-gateway:** sem regra de negócio hardcoded só Asaas no Billing Core (ou N/A)

## Checklist técnico

- [ ] Sem migrations destrutivas sem plano de rollback
- [ ] Flags destrutivas permanecem OFF por default
- [ ] Testes unitários/integração da sprint
- [ ] Regressão: checkout plano + renovação SaaS (ou justificar N/A)
- [ ] Rollback descrito (flag OFF / revert PR)

## Checklist QA Sprint 0 (baseline)

- [ ] Checkout plano + webhook paid
- [ ] Renovação job (sandbox/staging)
- [ ] `/saas-pay` abre
- [ ] Hub `/superadmin/financeiro` navega (novos cards abrem placeholder ou flags)
- [ ] `GET /api/superadmin/billing/feature-flags` retorna inventário
- [ ] Nenhuma suspensão automática nova
- [ ] `consumed_by_billing_runtime: false` no snapshot de flags

## Gate

- [ ] QA da sprint verde
- [ ] Aprovação explícita do product owner antes da Sprint N+1
