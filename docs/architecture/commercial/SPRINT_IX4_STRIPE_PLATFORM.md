# IX Sprint 4 — Stripe da plataforma

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-30 |
| **Sprint** | **IX4** concluída |
| **Plano** | [`PLAN_IX_IDIOMA_MOEDA_STRIPE.md`](./PLAN_IX_IDIOMA_MOEDA_STRIPE.md) |
| **Sprints** | [`PLAN_SPRINTS_IX_IDIOMA_MOEDA_STRIPE.md`](./PLAN_SPRINTS_IX_IDIOMA_MOEDA_STRIPE.md) |
| **Próximo** | **IX5** — Stripe do tenant (`ok sprint ix5`) |

BRL continua no Asaas. USD/EUR da assinatura PainelCRM vão para a Stripe da plataforma. Flag `billing2.multi_gateway` default **OFF**: nenhuma chamada HTTP.

---

## Runbook (sandbox primeiro)

1. Super Admin → Gateway de pagamento → **Stripe da plataforma**.
2. Modo **Sandbox**. Cole `sk_test_...` e o `whsec_...` do endpoint `POST /api/webhooks/stripe`.
3. A secret não volta na API (só máscara com os 4 últimos). Alternativa de ambiente: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MODE=test|live`. A linha do banco tem prioridade e **não** desliga o Asaas ativo.
4. No catálogo `payment_gateways`, ligue `is_enabled` da linha `stripe` (a migração 302 deixa desligado de propósito).
5. Ligue a flag `billing2.multi_gateway`.
6. Publique de novo o preço USD/EUR do plano. O backend cria Product/Price e grava `stripe_price_id`.
7. Checkout com moeda USD ou EUR redireciona ao Stripe Checkout (subscription). PIX e boleto só em BRL.
8. Webhook (`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`) exige assinatura válida. Evento pago marca a fatura e ativa o plano pelo mesmo contrato do Asaas.
9. Produção: troque o modo para live, chave live e webhook live. Não misture gateway na mesma assinatura ativa.

Assinatura ativa em Asaas/BRL recusa Stripe, e o inverso também (`MIXED_SAAS_GATEWAY`).

**Fora:** Stripe do tenant (IX5). Imposto internacional. Renovação Asaas.
