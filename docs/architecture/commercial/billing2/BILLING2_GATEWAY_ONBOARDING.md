# Billing 2.0 — Onboarding de Gateway (PRD §15)

Checklist produto/técnico **antes** de ativar um 2º gateway SaaS em produção.

## Princípios

1. PainelCRM = cérebro; gateway = executor.
2. Core/policy falam `PaymentGateway` + **capabilities** — sem HTTP de vendor no Collection Policy Engine.
3. Asaas permanece default enquanto `billing2.multi_gateway` = **OFF**.

## Checklist (obrigatório)

### Produto

- [ ] Decisão comercial do vendor (país, métodos, PCI, Pix Automático se BR)
- [ ] Contratos / elegibilidade sandbox e produção
- [ ] Métodos oferecidos no checkout SaaS alinhados às capabilities
- [ ] UX Cobrança Automática **sem** labels de vendor (só tela Gateways menciona o nome)

### Técnico

- [ ] Adapter em `packages/backend/src/modules/gateways/<key>/`
- [ ] `registerGateway('<key>', factory)` em `gatewayRegistry.ts`
- [ ] Entrada em `GATEWAY_CAPABILITIES_CATALOG` (`gatewayCapabilities.ts`)
- [ ] Parser webhook: `registerGatewayParser('<key>', parser)` + rota dedicada **ou** path genérico isolado
- [ ] Seed `payment_gateways` (`is_enabled` conforme rollout)
- [ ] Testes unitários: factory + capabilities + mock `PaymentGateway`
- [ ] Regressão Asaas (flag OFF → resolver ignora 2º gateway)

### Segurança / ops

- [ ] Credenciais só em `payment_gateway_configs.credentials`
- [ ] Webhook auth token por config
- [ ] Idempotência `payment_events` por `gateway` + `event_id`
- [ ] Runbook: rollback = `billing2.multi_gateway=OFF` (+ config global volta a `asaas`)

### Feature Flag

| Flag | Default | Efeito |
|------|---------|--------|
| `billing2.multi_gateway` | **OFF** | OFF = SaaS sempre resolve Asaas (mesmo se config apontar outro key) |

## Capabilities atuais

| Gateway | pix | boleto | creditCard | cardToken | pixAutomatic | getPayment | webhooks |
|---------|-----|--------|------------|-----------|--------------|------------|----------|
| asaas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| stripe (skeleton S11) | ❌ | ❌ | ✅* | ✅* | ❌ | ✅* | ✅* |

\*Declarado no catálogo; skeleton **lança erro** em runtime até adapter real.

## Isolamento webhook SaaS vs CRM

- SaaS: config `scope=global` + endpoints `/api/webhooks/<gateway>` (Asaas hoje).
- CRM: config `scope=tenant` (ex.: Mercado Pago) — **fora** do multi-gateway SaaS S11.
- Parsers registrados por `gateway_key` em `webhookCore` — sem misturar payloads.

## Rollback

1. Super Admin → Feature Flags → `billing2.multi_gateway` = OFF  
2. Gateway global SaaS = `asaas`  
3. Skeleton Stripe permanece no catálogo com `is_enabled=false`

## Referências

- `IMPLEMENTATION_PLAN_BILLING_2.md` Sprint 11  
- `AUDIT_BILLING_PIPELINE_OWNERSHIP_RUNTIME.md`  
- `gatewayCapabilities.ts` · `gatewayRegistry.ts` · `gatewayResolver.ts`
