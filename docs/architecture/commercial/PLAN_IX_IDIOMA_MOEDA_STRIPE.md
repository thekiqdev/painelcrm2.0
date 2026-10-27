# Plano — Internacionalização (idioma, moeda e Stripe)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-29 |
| **Tipo** | Plano de produto e arquitetura |
| **Nome** | **IX — Internacional (idioma, moeda, Stripe)** |
| **Idiomas** | `pt-BR` (origem) · `en` · `es` |
| **Moedas** | `BRL` (origem) · `USD` · `EUR` |
| **Sprints** | [`PLAN_SPRINTS_IX_IDIOMA_MOEDA_STRIPE.md`](./PLAN_SPRINTS_IX_IDIOMA_MOEDA_STRIPE.md) |
| **Status** | **IX concluída** — idiomas, moedas e Stripe fechados na IX10 |

---

## 1. Objetivo

O PainelCRM passa a atender cliente de fora do Brasil sem trocar a operação atual em português e real.

1. A landing e o sistema detectam **idioma** e **moeda** do visitante e permitem troca manual.
2. O Super Admin cria preços de plano em **BRL, USD e EUR**.
3. A assinatura da plataforma (PainelCRM cobra o tenant) usa **Asaas em BRL** e **Stripe em USD e EUR**.
4. O tenant configura **Stripe** para cobrar os próprios clientes (faturas, loja, checkout), no mesmo modelo de credencial que já existe para Asaas.
5. A interface do produto, os e-mails de sistema e as notificações de plataforma ficam **100%** em português, inglês e espanhol.

---

## 2. Estado atual (base deste plano)

| Área | Hoje |
|------|------|
| Idioma | Textos fixos em português. Datas com `date-fns/locale` `ptBR` e `toLocaleString('pt-BR')` espalhados no frontend. Não há biblioteca de i18n. |
| Moeda da plataforma | `plans.price_cents` e `plan_interval_prices` são reais implícitos. A UI do Super Admin (`SuperAdminPlans`) formata sempre `BRL`. |
| Assinatura SaaS | `billingSubscriptionService` grava cobrança em `BRL`. Gateway de produção da plataforma é Asaas (PIX, boleto, cartão, assinatura nativa). |
| Stripe SaaS | Catálogo `payment_gateways.key = stripe` existe (`database/init/302_billing2_multi_gateway.sql`), `is_enabled` começa desligado, flag `billing2.multi_gateway` default **OFF**. O adapter `stripeSaasSkeleton` lança erro em toda operação e o parser de webhook recusa eventos. Nenhuma chamada HTTP à Stripe. |
| Gateway do tenant | Catálogo financeiro selecionável: Asaas e, se o ambiente ligar, Mercado Pago (`financialAvailableGateways`). Stripe não entra nessa lista. |
| Notificações de plataforma | Templates já têm coluna `locale`, com conteúdo semeado em `pt-BR`. |
| Produto do tenant | `products.currency` existe e default é `BRL`; várias telas ainda formatam só real. |
| Landing | `src/landingpage` (preços em `formatMoneyBRLFromCents`) e landing estática em `src/landing`. Checkout público em `PlanCheckout`. |

O que permanece: Brasil continua em português, real e Asaas. PIX, boleto e Pix Automático continuam exclusivos do Asaas.

---

## 3. Decisões de produto

| ID | Tema | Decisão |
|----|------|---------|
| **D1** | Idiomas | `pt-BR`, `en`, `es`. Português do Brasil é o idioma de origem e o fallback. |
| **D2** | Moedas | `BRL`, `USD`, `EUR`. Preço é cadastrado em cada moeda. Não há conversão cambial automática. |
| **D3** | Idioma e moeda são independentes | Espanhol não implica euro. México em espanhol vê **USD** se a moeda local não estiver no catálogo. Espanha em espanhol vê **EUR**. |
| **D4** | Detecção de idioma | 1) preferência salva (conta ou cookie) 2) `Accept-Language` / `navigator.languages` 3) país, só como desempate 4) `pt-BR`. |
| **D5** | Detecção de moeda | 1) moeda da assinatura, se o tenant já estiver logado 2) preferência salva na landing/checkout 3) país (`CF-IPCountry`, com fallback) 4) `USD`. |
| **D6** | Mapa de país → moeda | Brasil → `BRL`. Zona do euro (AT, BE, CY, DE, EE, ES, FI, FR, GR, HR, IE, IT, LT, LU, LV, MT, NL, PT, SI, SK) → `EUR`. Demais países → `USD`. |
| **D7** | Moeda da assinatura | Congelada no checkout. Trocar o idioma da interface não recalcula a fatura. Trocar de moeda exige novo plano/contratação, não um toggle na conta ativa. |
| **D8** | Modelo de plano | Um plano comercial (limites, features, trial) com **tabela de preços por moeda e intervalo**. O Super Admin publica BRL, USD e/ou EUR no mesmo plano. Moeda sem preço não aparece para aquele visitante. |
| **D9** | Textos do plano | Nome, descrição e benefícios têm tradução `pt-BR` / `en` / `es` editável no Super Admin. Sem tradução, a landing mostra o texto `pt-BR`. |
| **D10** | Gateway por moeda (SaaS) | `BRL` → Asaas. `USD` e `EUR` → Stripe da plataforma. Flag `billing2.multi_gateway` só liga depois do adapter real em sandbox. |
| **D11** | Stripe do tenant | Conta Stripe **do próprio tenant** (secret key restrita + webhook secret), escopo `payment_gateway_configs.scope = tenant`. A chave global da plataforma não cobra cliente final do CRM. |
| **D12** | Stripe da plataforma | Chaves só no backend (Easypanel / secrets). Checkout da assinatura PainelCRM em USD/EUR via Stripe Billing (Checkout Session + Subscription + webhook). |
| **D13** | O que é “100% traduzido” | Chrome da UI, validação visível, e-mails de sistema, templates de notificação da plataforma, PDFs gerados pelo sistema e mensagens de erro exibidas ao usuário. |
| **D14** | O que permanece no idioma do autor | Mensagens de chat, nomes de clientes, funis, templates WhatsApp criados pelo tenant, páginas legais editadas pelo tenant e anotações. O sistema oferece idioma da interface; o conteúdo de negócio continua como foi escrito. |
| **D15** | Fallback de tradução | Chave ausente cai em `pt-BR` em runtime. CI falha se um namespace marcado como entregue tiver chave faltando em `en` ou `es`. |
| **D16** | Partner / atacado | Fora desta fase. Licença de parceiro continua em BRL/Asaas até um plano próprio. |

---

## 4. Detecção na landing e no sistema

```
Visitante
  │
  ├─ Idioma
  │    cookie painelcrm_locale  →  Accept-Language  →  pt-BR
  │
  └─ Moeda
       assinatura do tenant (se logado)
         → cookie painelcrm_currency
         → país (CF-IPCountry)
         → USD
```

Superfícies que obedecem a detecção:

- Landing (`/landing` e a landing estática) — copy, preços e seletor idioma + moeda.
- Checkout de plano (`PlanCheckout`) — lista só planos com preço na moeda resolvida; o gateway segue a moeda.
- App autenticado — idioma da preferência do usuário (`users` ou perfil). A moeda exibida nas telas **da assinatura PainelCRM** é a da assinatura, não a do browser.
- Telas financeiras do tenant — moeda do documento (fatura, produto, contrato), formatada com o locale da interface.

País: o backend lê `CF-IPCountry` quando o tráfego passa pela Cloudflare. Sem o header, o endpoint público devolve moeda `USD` e idioma pelo `Accept-Language`, e a landing mostra o seletor em destaque. Não usar geo IP de terceiros nesta fase.

Preferência anônima fica em cookie (`SameSite=Lax`, 180 dias). Preferência de usuário logado fica no banco e ganha do cookie.

---

## 5. Planos por moeda (Super Admin)

Hoje `public.plans` guarda um `price_cents` e `public.plan_interval_prices` é único por `(plan_id, billing_interval)` — os dois representam real.

Alvo:

- `plan_interval_prices` ganha `currency` (`BRL` \| `USD` \| `EUR`) e a unicidade passa a `(plan_id, billing_interval, currency)`.
- Linhas atuais migram com `currency = 'BRL'`.
- `plans.price_cents` permanece o preço de lista **BRL** do plano standard (compatível com o checkout atual) até o checkout ler a tabela por moeda. Preços USD/EUR de plano standard ficam em `plan_currency_prices (plan_id, currency, price_cents)`.
- Textos: `plan_translations (plan_id, locale, name, description, benefits)`.

No Super Admin (`SuperAdminPlans`):

- Abas **Real**, **Dólar**, **Euro** no formulário do plano.
- Cada aba tem preço de lista e, no plano custom, preço por usuário e por instância WhatsApp em cada intervalo (mensal, trimestral, semestral, anual).
- Aba vazia = plano indisponível naquela moeda.
- Bloco de tradução do nome, descrição e benefícios.
- Lista de planos mostra em quais moedas o plano está publicado.

API pública de preços usada pela landing e pelo checkout filtra por `currency` e devolve o `locale` pedido. Plano sem preço na moeda não entra na grade.

---

## 6. Stripe — duas integrações

São dois produtos. Compartilham o SDK e o conceito de webhook; **não** compartilham a chave secreta.

### 6.1 PainelCRM (SaaS) — a plataforma cobra o tenant

| Moeda | Gateway | Meios |
|-------|---------|--------|
| BRL | Asaas (inalterado) | PIX, boleto, cartão, assinatura Asaas |
| USD | Stripe plataforma | Cartão via Stripe Checkout + Subscription |
| EUR | Stripe plataforma | Cartão via Stripe Checkout + Subscription |

Trabalho em cima do esqueleto existente:

- Trocar `getStripeSaasSkeletonGateway` por adapter que chama a API Stripe.
- Assinar webhook (`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated|deleted`) no parser que hoje rejeita payload.
- Criar Product/Price na Stripe quando o Super Admin publica preço USD ou EUR (guardar `stripe_price_id` no preço).
- Roteamento: moeda da assinatura escolhe o gateway. `billing2.multi_gateway` liga só com a flag, em sandbox primeiro.
- Credencial global em `payment_gateway_configs` (`scope = global`, `gateway_key = stripe`): secret key e webhook secret. Ambiente test/live.

Renovação, dunning e “Meu plano” em USD/EUR leem o estado da Subscription Stripe. O ciclo BRL continua no Asaas. Uma assinatura não mistura gateways.

### 6.2 Tenant — o CRM cobra o cliente do tenant

O tenant cola a própria chave Stripe em Configurações → Gateways, no mesmo lugar do Asaas.

- Incluir `stripe` em `getAvailableFinancialGatewayKeys` atrás de flag de ambiente (padrão do Mercado Pago).
- Habilitar a linha do catálogo para uso **tenant** (a linha SaaS skeleton de hoje é outra preocupação: separar capabilities SaaS vs tenant no registry para um adapter não atender o fluxo do outro).
- Cobrança de fatura avulsa e checkout da loja pública (`StorePublicCheckout`) com PaymentIntent ou Checkout Session na moeda do documento (`BRL`, `USD` ou `EUR`).
- Webhook por tenant (endpoint com segredo do tenant).
- PIX/boleto do tenant continuam no Asaas. Stripe do tenant nesta fase é cartão.

Stripe Connect (conta conectada, sem o tenant colar secret key) fica como evolução. A fase IX entrega o modelo de credencial já usado pelo Asaas.

---

## 7. Tradução 100% do sistema

Não existe i18n. O frontend tem na ordem de milhares de módulos em `src/` e `packages/backend/src`. A meta de 100% é por **superfície entregue**, com CI, e não um arquivo único no fim.

Fundação (antes de traduzir telas):

- `i18next` + `react-i18next` no frontend.
- Namespaces por domínio: `common`, `landing`, `auth`, `checkout`, `nav`, `crm`, `chat`, `finance`, `billing`, `settings`, `superadmin`, `partner`, `legal`.
- `pt-BR` é o JSON fonte. `en` e `es` são os alvos.
- Helper único de data (`formatAppDate`) e de dinheiro (`formatAppMoney(cents, currency)`), com locale do idioma ativo. Some o `pt-BR` / `BRL` fixo nas telas cobertas pelo sprint.
- Backend: locale da request (`cookie` ou perfil) para e-mail, PDF e erro de API exposto na UI.
- Templates `platform_notification_template_system` ganham linhas `en` e `es` para cada evento que hoje existe em `pt-BR`.

Ordem de cobertura (detalhe nas sprints):

1. Landing, login, cadastro, checkout, páginas legais públicas.
2. Shell do app (menu, ajustes, dashboard).
3. CRM, chat, agenda, tickets.
4. Financeiro, contratos, propostas, loja, automações.
5. Super Admin, partner, notificações, PDFs e e-mails de sistema.

Conteúdo dinâmico do plano (nome e benefícios) usa `plan_translations`, não o JSON de UI.

Critério de pronto de um namespace: toda string visível daquele domínio está em chave; `en` e `es` completos; navegação manual no idioma; nenhuma data ou valor monetário daquela tela preso em `pt-BR`/`BRL` quando a moeda do documento for outra.

---

## 8. Arquitetura alvo (visão)

```
Landing / Checkout
  resolveLocale() + resolveCurrency()
        │
        ▼
  GET /api/public/plans?currency=USD&locale=en
        │
        ├─ BRL ──► Asaas (fluxo atual)
        └─ USD|EUR ──► Stripe plataforma
                         Product/Price + Checkout Session
                         webhook → assinatura + fatura

App do tenant
  locale do usuário
  documentos na moeda do registro
        │
        ├─ Asaas do tenant (BRL, PIX, boleto, cartão)
        └─ Stripe do tenant (cartão, BRL|USD|EUR do documento)
```

---

## 9. Fora desta fase

- Moedas além de BRL, USD e EUR (MXN, GBP, etc.).
- Conversão automática de preço pelo câmbio do dia.
- Imposto internacional (Stripe Tax, IVA, nota fiscal fora do Brasil).
- Trocar Asaas no Brasil.
- Stripe Connect.
- Traduzir histórico de chat, dados de clientes e templates que o tenant escreveu.
- Planos de parceiro / atacado em dólar ou euro.
- Idiomas além de inglês e espanhol.

---

## 10. Riscos

| Risco | Mitigação |
|-------|-----------|
| Tradução “100%” sem fronteira vira projeto infinito | Namespaces com CI e critério de pronto por sprint. Conteúdo do tenant fica de fora (D14). |
| Checkout BRL regride ao introduzir moeda | Preço BRL migrado 1:1. Flag de moeda estrangeira default OFF até IX4. Suite do checkout atual permanece verde. |
| Skeleton Stripe ligado em produção por engano | Adapter real só substitui o skeleton atrás de `billing2.multi_gateway` e `payment_gateways.is_enabled`. Testes do skeleton continuam garantindo que, com a flag OFF, o resolver não cobra na Stripe. |
| Chave da plataforma usada para cobrar cliente do tenant | Escopos `global` e `tenant` separados. Teste de regressão: fatura de cliente nunca lê a secret key global. |
| País errado (VPN, header ausente) | Seletor visível na landing. Moeda da assinatura já paga não muda. |
| Preço único `(plan_id, intervalo)` impede duas moedas | Migração altera a unique key antes de qualquer UI nova. |
| E-mail e PDF ficam em português com a UI em inglês | Entram no mesmo critério de 100% (sprint de notificações), com `locale` que a tabela já possui. |

---

## 11. Pronto quando

- Visitante nos EUA vê a landing em inglês e preços em dólar; visitante na Espanha vê espanhol e euro; visitante no Brasil vê português e real; os três podem trocar idioma e moeda antes de contratar.
- Super Admin publica o mesmo plano com preços distintos em BRL, USD e EUR, e a moeda sem preço não aparece.
- Checkout USD/EUR cobra na Stripe de teste e de produção da plataforma; checkout BRL segue no Asaas.
- Tenant conecta Stripe de teste e recebe uma fatura de cliente em USD (e outra em BRL no cartão Stripe, se o documento estiver em real).
- Namespaces acordados estão completos em `en` e `es`, com CI bloqueando chave faltante.
- Conta brasileira existente não muda idioma, moeda, gateway nem valor.

Fechamento em [`SPRINT_IX10_CLOSEOUT.md`](./SPRINT_IX10_CLOSEOUT.md). Namespaces em `complete`, checks no build do frontend, preço BRL preservado no teste de catálogo. Os cinco roteiros de pagamento em staging dependem das chaves sandbox e não foram executados neste ambiente.
