# Sprint WC1 — Quantidade WhatsApp obrigatória no custom

| Campo | Valor |
|-------|--------|
| **Sprint** | WC1 |
| **Gate** | Em execução após **OK Sprint 1** (2026-07-20) |
| **Plano-mãe** | [PLANO_WHATSAPP_CUSTOM_QUANTITY.md](./PLANO_WHATSAPP_CUSTOM_QUANTITY.md) |

---

## Objetivo

Plano personalizado não nasce com conexões WhatsApp ilimitadas por omissão: Super Admin e API exigem quantidade contratada (`max_whatsapp_instances_override`).

## Entregas

| Item | Detalhe |
|------|---------|
| Helper | Validação de override WhatsApp para `plan_type=custom` |
| API | `createTenant`, `putTenantLimits`, troca de plano → 400 se custom sem quantidade |
| SA | Criar cliente + Limites: campo obrigatório; piso ≥ uso atual |
| Catálogo | Labels piso inclusas + preço por extra no custom |
| Ops | Checklist SQL de custom sem teto efetivo |
