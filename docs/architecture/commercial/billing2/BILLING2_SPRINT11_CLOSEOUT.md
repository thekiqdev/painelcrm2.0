# Billing 2.0 — Sprint 11 Closeout

| Campo | Valor |
|-------|-------|
| **Sprint** | 11 — Multi Gateway |
| **Data** | 2026-07-27 |
| **Status** | Implementada — aguardando aprovação |
| **Nota** | Pós-MVP; flag `multi_gateway` default **OFF**; Stripe = skeleton |

## Entregáveis

| Item | Status |
|------|--------|
| Capabilities interface + catálogo | ✅ |
| Registry além de Asaas (`stripe`) | ✅ |
| Parser webhook path genérico (stripe skeleton) | ✅ |
| Resolver: non-asaas SaaS exige flag ON | ✅ |
| Doc onboarding PRD §15 | ✅ |
| UI Cobrança Automática sem label “Asaas” | ✅ |
| Capabilities na lista Gateways | ✅ |
| Migration `302` (flag + catálogo stripe disabled) | ✅ |
| Testes mock/capabilities | ✅ |
| Adapter Stripe **real** (sandbox cobrança) | ❌ skeleton only (plano permite) |

## Critérios de aceite

- [x] Billing Core / Collection Policy **não** importa HTTP Asaas
- [x] Troca de gateway config com flag OFF **não** quebra (fallback Asaas)
- [x] Testes com capabilities / skeleton
- [ ] Smoke: flag OFF + config stripe → continua Asaas
- [ ] Smoke: flag ON + stripe → erro skeleton (esperado até adapter real)

## Rollback

1. `billing2.multi_gateway` = OFF  
2. Asaas permanece default global  

## Arquivos

- `packages/backend/src/modules/payments/gatewayCapabilities.ts`
- `packages/backend/src/modules/payments/gatewayRegistry.ts` / `gatewayResolver.ts`
- `packages/backend/src/modules/gateways/stripe/*`
- `database/init/302_billing2_multi_gateway.sql`
- [`BILLING2_GATEWAY_ONBOARDING.md`](./BILLING2_GATEWAY_ONBOARDING.md)

## Próximo

S12 Hardening — **não inicia** sem OK explícito.
