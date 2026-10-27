# Sprint IX8 — Financeiro, contratos, loja e automações

**Status:** concluída  
**Plano:** [PLAN_SPRINTS_IX_IDIOMA_MOEDA_STRIPE.md](./PLAN_SPRINTS_IX_IDIOMA_MOEDA_STRIPE.md)

## Entrega

Namespaces `finance`, `contracts`, `proposals`, `store` e `automation` em pt-BR, en e es.

O valor exibido usa a moeda do registro:

- Fatura: `gateway_metadata.currency` (BRL, USD ou EUR). Sem moeda, continua BRL.
- Produto e checkout da loja: `product.currency`.
- Contrato: `contract.currency`.
- Proposta: BRL, com formatação do idioma da interface.

A criação de fatura aceita `currency` opcional. Omitir mantém o fluxo Asaas/PIX em real. O pagamento público devolve `currency` para o link da fatura.

A tela de gateways do tenant (Asaas, Mercado Pago e Stripe) usa o namespace `finance`.

## Verificação

`npm run check:i18n` — 17 namespaces completos.
