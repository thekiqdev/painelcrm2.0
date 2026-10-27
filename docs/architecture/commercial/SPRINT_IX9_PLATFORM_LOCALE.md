# Sprint IX9 — Super Admin, partner, e-mail, PDF e notificações

**Status:** concluída  
**Plano:** [PLAN_SPRINTS_IX_IDIOMA_MOEDA_STRIPE.md](./PLAN_SPRINTS_IX_IDIOMA_MOEDA_STRIPE.md)

## Entrega

Namespaces `superadmin` e `partner` (chrome de planos, notificações da plataforma e painel do revendedor). O texto comercial do plano continua em `plan_translations`.

A migration `352_ix9_platform_locale_templates.sql` insere `en` e `es` para os eventos de sistema que ainda só existiam em `pt-BR` (cobrança, pagamento confirmado, trial, plano, tickets). Boas-vindas e código de senha já estavam na IX6.

O envio escolhe `profiles.locale` do admin do tenant. Sem preferência, ou sem template naquele idioma, cai em `pt-BR`.

O PDF da cobrança da plataforma fica em `GET /api/public/saas-billing/:token/pdf`: rótulos no idioma do tenant e valor na moeda da assinatura (`BRL`, `USD` ou `EUR`). O PDF de contrato gerado pelo snapshot usa `tenants.locale` nos rótulos de assinatura.

No Super Admin, o override de template lista os três locales. A API já aceitava `locale`.

## Verificação

`npm run check:i18n` — 19 namespaces completos.
