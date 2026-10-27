# Sprint IX10 — Fechamento

**Status:** concluída  
**Plano:** [PLAN_IX_IDIOMA_MOEDA_STRIPE.md](./PLAN_IX_IDIOMA_MOEDA_STRIPE.md)

IX0 a IX9 estão concluídas. Esta sprint declara a cobertura e trava a regressão do Brasil.

## Cobertura

`src/locales/manifest.json` marca 19 namespaces em `complete` para `pt-BR`, `en` e `es`: `common`, `landing`, `auth`, `checkout`, `legal`, `nav`, `dashboard`, `crm`, `chat`, `agenda`, `tickets`, `settings`, `finance`, `contracts`, `proposals`, `store`, `automation`, `superadmin`, `partner`.

O namespace `billing` do plano de produto está coberto por `finance` e `checkout`. Não há um JSON separado.

`npm run check:i18n` falha se um namespace acordado sair de `complete` ou se faltar chave em `en` ou `es`. O build do frontend (`Dockerfile.frontend`) executa esse check e `npm run check:i18n-hardcode` antes do `npm run build`.

## O que ainda formata pt-BR ou BRL

`scripts/i18n-hardcode-allowlist.json` lista cada arquivo de `src/` que ainda usa `toLocaleString('pt-BR')` ou `currency: 'BRL'`, com a contagem e o motivo. Arquivo novo, ou contagem maior, quebra o check.

Motivos que permanecem de propósito:

- Fixture de teste.
- Máscara de digitação em real (`brlCurrencyInput`).
- Importação e formulário de criação: o default do Brasil é BRL. O valor gravado é o da moeda escolhida.
- Livro financeiro sem coluna de moeda (contas, despesas, cartão, projetos).
- Licença de parceiro (decisão D16): continua em BRL.
- Interior operacional do Super Admin fora do chrome de planos e notificações.
- Telas de assinatura que ainda desenham o valor em real. O centavo gravado em `plans.price_cents` e na assinatura BRL não é recalculado quando o plano ganha preço em USD ou EUR.

## Regressão BRL

`planHasCurrency` omite o plano na moeda estrangeira quando não há preço nessa moeda. BRL de plano padrão continua publicado pelo `price_cents` original. `resolveListPriceCents` em BRL devolve esse centavo mesmo com linhas USD e EUR ao lado. O teste está em `packages/backend/src/i18n/planMulticurrency.test.ts`.

Com `billing.multicurrency_v1` desligada, `GET /api/plans` ignora `currency` e `locale` e responde só BRL / pt-BR.

## Flags

| Flag | OFF |
|------|-----|
| `i18n.locale_detection_v1` | Visitante anônimo fica em pt-BR e BRL. O locale do perfil logado continua valendo. |
| `billing.multicurrency_v1` | Catálogo público só em BRL. |
| `billing2.multi_gateway` | Nenhuma chamada HTTP à Stripe da plataforma. Checkout BRL segue no Asaas. |
| `financial.stripe_tenant_v1` | Stripe some das opções novas do tenant. A config já salva permanece. Nenhuma chamada HTTP. |

A linha `payment_gateways` de `stripe` nasce com `is_enabled` desligado (migration 302).

Desligar USD/EUR sem mexer no Brasil: desligue `billing.multicurrency_v1` e `billing2.multi_gateway`. Não apague `plans.price_cents`, a assinatura BRL nem a credencial Asaas. Preços USD/EUR gravados ficam no banco e deixam de aparecer no catálogo público enquanto a flag de moeda estiver OFF.

## Webhooks Stripe

- Plataforma: `POST /api/webhooks/stripe`. Secret da credencial global (`whsec_...`). Eventos: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
- Tenant: `POST /api/webhooks/stripe-tenant/{tenantId}`. Secret só daquela empresa. `checkout.session.completed` com `payment_status=paid` quita a fatura `gateway=stripe`.

Detalhe operacional: [SPRINT_IX4_STRIPE_PLATFORM.md](./SPRINT_IX4_STRIPE_PLATFORM.md) e [SPRINT_IX5_STRIPE_TENANT.md](./SPRINT_IX5_STRIPE_TENANT.md).

## Nota de rollout

Ligue `i18n.locale_detection_v1` e `billing.multicurrency_v1` em produção só depois do sandbox da Stripe da plataforma (IX4) com um checkout USD de teste pago. Ligue `financial.stripe_tenant_v1` por ambiente, não junto com a flag da plataforma. `billing2.multi_gateway` só depois da credencial sandbox e do `is_enabled` da linha `stripe`.

## Roteiro manual (staging)

Cada linha usa uma conta nova. A assinatura BRL já existente não entra nesses fluxos.

1. **BR / pt-BR / BRL / Asaas.** Detecção pode ficar OFF. Landing em português, preço em real, checkout no Asaas (PIX, boleto ou cartão). Idioma do perfil permanece pt-BR.
2. **US / en / USD / Stripe plataforma.** Flags de detecção, multicurrency e `billing2.multi_gateway` ON, Stripe sandbox da plataforma ligada. Landing em inglês, plano com preço USD, checkout abre a Stripe. Plano sem preço USD não aparece.
3. **ES / es / EUR / Stripe plataforma.** Mesmas flags. Visitante com locale espanhol e moeda EUR. Plano sem preço EUR não aparece.
4. **MX / es / USD.** País México resolve espanhol e dólar (não há MXN). Checkout USD na Stripe da plataforma.
5. **Tenant Stripe sandbox.** Flag `financial.stripe_tenant_v1` ON, credencial da empresa em sandbox. Uma fatura de cliente em USD e outra em BRL no cartão Stripe. PIX e boleto continuam no Asaas.

## Verificação neste ambiente

- `npm run check:i18n` — 19 namespaces.
- `npm run check:i18n-hardcode` — 122 arquivos na lista.
- `planMulticurrency.test.ts` — 5 testes, incluindo preço BRL intacto e plano sem preço USD omitido.

Os cinco roteiros de pagamento não rodaram aqui: este ambiente não tem chave sandbox da Stripe nem sessão de Super Admin.
