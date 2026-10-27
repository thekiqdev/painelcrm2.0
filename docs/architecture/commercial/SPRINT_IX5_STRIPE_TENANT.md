# IX Sprint 5 — Stripe do tenant

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-30 |
| **Sprint** | **IX5** concluída |
| **Plano** | [`PLAN_IX_IDIOMA_MOEDA_STRIPE.md`](./PLAN_IX_IDIOMA_MOEDA_STRIPE.md) |
| **Sprints** | [`PLAN_SPRINTS_IX_IDIOMA_MOEDA_STRIPE.md`](./PLAN_SPRINTS_IX_IDIOMA_MOEDA_STRIPE.md) |
| **Próximo** | **IX6** — tradução da superfície pública (`ok sprint ix6`) |

Cada empresa conecta a própria Stripe e cobra o cliente no cartão, na moeda do documento (BRL, USD, EUR). PIX e boleto ficam no Asaas. A secret da plataforma (IX4) não entra neste fluxo.

Flag `financial.stripe_tenant_v1` default **OFF**.

---

## Runbook (sandbox primeiro)

1. Ligue a flag `financial.stripe_tenant_v1`. Com ela OFF, Stripe some das opções novas e nenhuma chamada HTTP acontece. A config já salva permanece no banco.
2. Configurações → Gateways de pagamento → **Stripe**.
3. Modo **Sandbox**. Cole `sk_test_...` da conta da empresa e o `whsec_...` do endpoint mostrado no card: `POST /api/webhooks/stripe-tenant/{tenantId}`.
4. A secret não volta na API (só máscara). O teste de conexão chama `GET /v1/balance` com essa secret. Flag OFF responde 409 e não chama a Stripe.
5. A linha fica `scope=tenant`, `options.stripe_scope=tenant`, `is_active=true`. Salvar o Asaas não desliga essa linha. O gateway padrão do CRM continua o Asaas quando os dois estão ativos.
6. Fatura com `gateway=stripe` (ou loja com produto em USD/EUR) abre Stripe Checkout `mode=payment`. BRL da loja segue Asaas. CPF não é exigido nesse caminho.
7. Webhook `checkout.session.completed` com `payment_status=paid` marca `customer_invoices` paga quando `gateway=stripe` e `gateway_reference_id` é o id da sessão. A assinatura usa só o `webhook_secret` daquele tenant.
8. Produção: modo live, chave live e webhook live da conta da empresa.

**Fora:** Stripe Connect. Assinatura recorrente do cliente final na Stripe. Mercado Pago continua disponível se estiver ligado no ambiente.
