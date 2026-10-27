# Plano de sprints — Internacionalização (idioma, moeda e Stripe)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-29 |
| **Tipo** | Plano de implantação (produto + arquitetura + sprints) |
| **Nome** | **IX — Internacional (idioma, moeda, Stripe)** |
| **Plano** | [`PLAN_IX_IDIOMA_MOEDA_STRIPE.md`](./PLAN_IX_IDIOMA_MOEDA_STRIPE.md) |
| **Idiomas** | `pt-BR` · `en` · `es` |
| **Moedas** | `BRL` · `USD` · `EUR` |
| **Status** | **IX10 concluída** — cobertura, regressão BRL e runbook |
| **IX0** | [`SPRINT_IX0_INVENTORY_AND_ADR.md`](./SPRINT_IX0_INVENTORY_AND_ADR.md) |
| **IX3** | [`SPRINT_IX3_PLAN_MULTICURRENCY.md`](./SPRINT_IX3_PLAN_MULTICURRENCY.md) |
| **IX4** | [`SPRINT_IX4_STRIPE_PLATFORM.md`](./SPRINT_IX4_STRIPE_PLATFORM.md) |
| **IX5** | [`SPRINT_IX5_STRIPE_TENANT.md`](./SPRINT_IX5_STRIPE_TENANT.md) |
| **IX6** | [`SPRINT_IX6_PUBLIC_SURFACE.md`](./SPRINT_IX6_PUBLIC_SURFACE.md) |
| **IX7** | [`SPRINT_IX7_APP_SURFACE.md`](./SPRINT_IX7_APP_SURFACE.md) |
| **IX8** | [`SPRINT_IX8_MONEY_DOCS.md`](./SPRINT_IX8_MONEY_DOCS.md) |
| **IX9** | [`SPRINT_IX9_PLATFORM_LOCALE.md`](./SPRINT_IX9_PLATFORM_LOCALE.md) |
| **IX10** | [`SPRINT_IX10_CLOSEOUT.md`](./SPRINT_IX10_CLOSEOUT.md) |
| **Kickoff** | Em chat: `ok sprint ix0` … `ok sprint ix10` |

| Sprint | Foco | Depende de | Status |
|--------|------|------------|--------|
| **IX0** | Decisões fechadas, inventário, ADR, flags | — | **Concluída** |
| **IX1** | Fundação i18n (runtime, locale, formatadores) | IX0 | **Concluída** |
| **IX2** | Detecção automática de idioma e moeda | IX1 | **Concluída** |
| **IX3** | Planos por moeda no Super Admin | IX0 | **Concluída** |
| **IX4** | Stripe da plataforma (PainelCRM cobra USD/EUR) | IX3 | **Concluída** |
| **IX5** | Stripe do tenant (CRM cobra o cliente) | IX0 | **Concluída** |
| **IX6** | Tradução da superfície pública | IX1, IX2 | **Concluída** |
| **IX7** | Tradução do app (shell, CRM, chat, agenda) | IX1 | **Concluída** |
| **IX8** | Tradução de financeiro, contratos, loja, automações | IX1, IX5 | **Concluída** |
| **IX9** | Tradução de Super Admin, partner, e-mail, PDF, notificações | IX1, IX3 | **Concluída** |
| **IX10** | Fechamento: cobertura, regressão pt-BR/BRL, runbook | IX4–IX9 | **Concluída** |

IX3 pode andar em paralelo com IX1–IX2. IX5 pode andar em paralelo com IX4 depois do IX0. Tradução de checkout e de “Meu plano” só fecha na IX6 depois que os textos da IX4 existirem.

---

## IX0 — Decisões, inventário e flags

**Status:** concluída em 2026-09-29. Registro: [`SPRINT_IX0_INVENTORY_AND_ADR.md`](./SPRINT_IX0_INVENTORY_AND_ADR.md).

**Objetivo:** congelar o contrato deste upgrade e listar o que o código faz hoje, antes de migrar preço ou ligar Stripe.

**Entregas:**

- ADR curto apontando para as decisões D1–D16 do plano (idiomas, moedas, detecção, plano com tabela de preço, dois Stripes, fronteira do “100%”).
- Inventário:
  - Telas que formatam `pt-BR` ou `BRL` fixo (frontend).
  - Inserts de assinatura que forçam `BRL` (`billingSubscriptionService` e afins).
  - Catálogo `payment_gateways` (`asaas`, `stripe` skeleton, `mercado_pago`).
  - Templates `platform_notification_template_system` com `locale = pt-BR`.
  - Superfícies públicas: `src/landingpage`, `src/landing`, `PlanCheckout`, páginas legais.
- Flags (default **OFF**):
  - `i18n.locale_detection_v1` — detecção e seletor de idioma.
  - `billing.multicurrency_v1` — preços USD/EUR e filtro da landing/checkout.
  - `billing2.multi_gateway` — já existe; continua OFF até a IX4.
  - `financial.stripe_tenant_v1` — Stripe na lista de gateways do tenant.
- Mapa país → moeda versionado no backend (lista da decisão D6).
- Checklist de segredos: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` da plataforma só em secret de ambiente; nunca no frontend.

**Aceite:**

- Nenhuma mudança de comportamento em produção (flags OFF).
- Documento de inventário revisado lista os pontos de `BRL` forçado na cobrança SaaS.

**Fora:** implementação de UI, cobrança, arquivos de tradução.

---

## IX1 — Fundação de idioma

**Status:** concluída em 2026-09-29.

**Objetivo:** o app consegue renderizar em `pt-BR`, `en` ou `es` sem traduzir ainda todos os domínios.

**Entregas:**

- `i18next` + `react-i18next`. Pasta `src/locales/{pt-BR,en,es}/`.
- Namespace `common` (botões, erros genéricos, vazio, loading) completo nos três idiomas — prova do pipeline.
- `LocaleProvider`: lê cookie `painelcrm_locale`, depois perfil, depois `navigator.languages`.
- Coluna de preferência de idioma no usuário e endpoint para salvar.
- `formatAppDate` / `formatAppMoney(amountCents, currency)` usados pelo namespace piloto (substituem chamada solta só nesse piloto).
- Middleware de locale no backend para respostas de erro que a UI exibe (o restante dos erros migra nas sprints de tradução).
- Script de CI: namespace marcado `complete` no manifesto falha se faltar chave em `en` ou `es`.

**Aceite:**

- Troca manual de idioma (query ou cookie, ainda sem seletor bonito) muda as strings de `common`.
- Data e valor do piloto acompanham o locale.
- Build e testes atuais de checkout BRL seguem verdes.

**Fora:** landing inteira, detecção por país, planos, Stripe.

**Entregue:** `i18next` no namespace `common` (`src/locales/{pt-BR,en,es}/common.json`), `LocaleProvider`, cookie `painelcrm_locale`, `PATCH /api/me/locale` em `profiles.locale` (coluna que já existia), `formatAppDate` / `formatAppMoney` no bloco de idioma de Preferências, middleware `localeMiddleware`, `npm run check:i18n`. Troca manual: `?lang=en` (ou `es` / `pt-BR`) ou o select em Configurações → Preferências. O restante da interface continua em português.

---

## IX2 — Detecção automática (landing e sistema)

**Status:** concluída em 2026-09-29.

**Objetivo:** o visitante chega no idioma e na moeda do próprio contexto, e consegue corrigir os dois.

**Entregas:**

- `GET /api/public/locale-context`:
  - idioma sugerido (cookie, `Accept-Language`, fallback `pt-BR`);
  - moeda sugerida (cookie, `CF-IPCountry` pelo mapa D6, fallback `USD`);
  - `country` quando o header existir.
- Cookie `painelcrm_currency` (180 dias), separado do cookie de idioma.
- Seletor **Idioma** e **Moeda** na landing (SPA e, se a estática tiver grade de preço, na estática também).
- App logado: idioma do perfil. Moeda da **assinatura PainelCRM** não segue o cookie.
- Flag `i18n.locale_detection_v1`. Com a flag OFF, tudo permanece `pt-BR` + `BRL`.

**Aceite:**

- Sem cookie, `Accept-Language: en` e país `US` → inglês + USD.
- `Accept-Language: es` e país `ES` → espanhol + EUR.
- `Accept-Language: es` e país `MX` → espanhol + USD.
- País `BR` → português (se o browser não pedir outro idioma) + BRL.
- Troca manual persiste no cookie e sobrevive ao reload.
- Header de país ausente não quebra a página; cai na regra de fallback e o seletor fica visível.

**Fora:** cobrar em USD/EUR (a grade ainda pode mostrar só BRL até a IX3). Tradução completa da landing (IX6).

**Entregue:** `GET /api/public/locale-context` (flag `i18n.locale_detection_v1`: OFF → pt-BR+BRL; ON → cookie / Accept-Language / `CF-IPCountry`). Cookie `painelcrm_currency`. Seletores na landing SPA e na estática. Preços da grade continuam em BRL; a preferência de moeda só é persistida para a IX3.

---

## IX3 — Planos por moeda no Super Admin

**Status:** concluída em 2026-09-29. Registro: [`SPRINT_IX3_PLAN_MULTICURRENCY.md`](./SPRINT_IX3_PLAN_MULTICURRENCY.md).

**Objetivo:** o Super Admin publica o mesmo plano em real, dólar e euro, com preço explícito em cada uma.

**Entregas:**

- Migração:
  - `plan_interval_prices.currency TEXT NOT NULL DEFAULT 'BRL'`.
  - Unique `(plan_id, billing_interval, currency)`.
  - Backfill das linhas atuais como `BRL`.
  - `plan_currency_prices (plan_id, currency, price_cents)` para o preço de lista standard em USD/EUR. `plans.price_cents` continua sendo o preço BRL.
  - `plan_translations (plan_id, locale, name, description, benefits)`.
- API Super Admin de criação/edição aceita preços por moeda e textos por locale.
- `SuperAdminPlans`: abas Real, Dólar e Euro; bloco de tradução pt-BR / en / es; coluna “moedas publicadas” na lista.
- `GET` público de planos ganha `currency` e `locale`. Moeda sem preço omite o plano.
- Flag `billing.multicurrency_v1`. OFF = resposta pública idêntica à de hoje (só BRL, texto atual da tabela `plans`).

**Aceite:**

- Plano existente aparece só em BRL, com o mesmo centavo de antes.
- Super Admin preenche USD e EUR; a API pública com `currency=USD` devolve esses preços e omite plano sem dólar.
- Benefits e nome em `en` aparecem com `locale=en`; sem tradução, volta o texto pt-BR.
- Checkout BRL ainda cobra o valor antigo (gateway Asaas intocado).

**Fora:** criar Product/Price na Stripe (IX4). Traduzir o chrome da tela Super Admin (IX9) — nesta sprint os rótulos novos podem nascer já com chave i18n, com copy pt-BR obrigatória e en/es se o namespace ainda não for `complete`.

**Entregue:** migração `349`; `plan_currency_prices` + `plan_translations`; Super Admin com abas de moeda e traduções; `GET /api/plans?currency=&locale=`; landing Pricing consome moeda/locale; billing BRL pinado. Flag `billing.multicurrency_v1` OFF = catálogo público igual ao de antes.

---

## IX4 — Stripe da plataforma (PainelCRM)

**Status:** concluída em 2026-09-30. Registro: [`SPRINT_IX4_STRIPE_PLATFORM.md`](./SPRINT_IX4_STRIPE_PLATFORM.md).

**Objetivo:** assinatura em dólar ou euro é cobrada na Stripe da PainelCRM. Real continua no Asaas.

**Entregas:**

- Adapter real no lugar de `stripeSaasSkeleton` para as operações de assinatura SaaS: customer, Checkout Session (mode subscription), consulta de invoice/subscription, cancelamento.
- Webhook com assinatura verificada: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
- Ao publicar preço USD/EUR, o backend cria (ou atualiza) Price na Stripe e grava `stripe_price_id`.
- Checkout (`PlanCheckout`) com moeda USD ou EUR abre Stripe Checkout. Sucesso e falha atualizam assinatura, fatura e “Meu plano” pelo mesmo contrato de status que o Asaas já alimenta.
- Roteamento por moeda da assinatura. Mistura de gateway na mesma assinatura é rejeitada.
- `billing2.multi_gateway` e `payment_gateways.is_enabled` para `stripe` documentados no runbook: sandbox primeiro, produção depois.
- Credencial global mascarada na tela de gateway do Super Admin (secret key + webhook secret + modo test/live).

**Aceite:**

- Sandbox: contratar plano USD gera Subscription Stripe, webhook marca fatura paga, tenant entra no plano.
- O mesmo fluxo em EUR.
- Plano BRL no mesmo ambiente segue Asaas; PIX continua disponível só em BRL.
- Flag OFF: nenhuma chamada HTTP à Stripe; testes do skeleton (ou equivalente “adapter inerte”) continuam válidos para o caminho desligado.
- Chave Stripe não aparece em resposta de API nem no bundle do frontend.

**Fora:** Stripe do tenant (IX5). Imposto internacional. Alterar renovação Asaas.

**Entregue:** adapter Stripe SaaS (flag OFF = sem HTTP, skeleton intacto); webhook com assinatura; `stripe_price_id` ao publicar USD/EUR; checkout redireciona ao Stripe Checkout; BRL/PIX segue Asaas; credencial mascarada no Super Admin. Runbook: [`SPRINT_IX4_STRIPE_PLATFORM.md`](./SPRINT_IX4_STRIPE_PLATFORM.md).

---

## IX5 — Stripe do tenant

**Objetivo:** cada empresa conecta a própria Stripe e cobra os clientes dela no cartão, na moeda do documento.

**Entregas:**

- Flag `financial.stripe_tenant_v1` inclui `stripe` em `getAvailableFinancialGatewayKeys`.
- Configuração em Configurações → Gateways: secret key restrita, webhook signing secret, modo test/live, teste de conexão. Escopo `tenant` em `payment_gateway_configs`.
- Adapter de tenant separado do adapter SaaS da IX4 (mesma pasta `modules/gateways/stripe`, credencial resolvida pelo escopo). A secret key global nunca é lida nesse fluxo.
- Fatura de cliente e checkout da loja (`StorePublicCheckout`) em `BRL`, `USD` ou `EUR` via Stripe quando o gateway ativo do documento for Stripe.
- Webhook do tenant identifica a conta e concilia pagamento com a fatura.
- PIX e boleto do tenant permanecem no Asaas.

**Aceite:**

- Tenant A com Stripe de teste paga uma fatura USD e uma BRL no cartão de teste; o pagamento não usa a chave da plataforma.
- Tenant B sem Stripe segue Asaas.
- Mercado Pago, se ligado no ambiente, continua disponível.
- Desligar a flag esconde Stripe das opções novas e não apaga config já salva.

**Fora:** Stripe Connect. Assinatura recorrente do cliente final na Stripe (pode entrar num incremento depois; a fase entrega cobrança avulsa e checkout de loja).

**Entregue:** adapter de tenant separado da plataforma (flag OFF = sem HTTP); credencial mascarada em Configurações → Gateways; webhook `POST /api/webhooks/stripe-tenant/:tenantId` com a secret do tenant; fatura e loja USD/EUR no cartão Stripe; PIX/boleto no Asaas. Runbook: [`SPRINT_IX5_STRIPE_TENANT.md`](./SPRINT_IX5_STRIPE_TENANT.md).

---

## IX6 — Tradução da superfície pública

**Objetivo:** landing, autenticação, checkout e páginas legais públicas 100% em pt-BR, en e es.

**Entregas:**

- Namespaces `landing`, `auth`, `checkout`, `legal` marcados `complete` nos três idiomas.
- Landing SPA e estática, login, cadastro, recuperação de senha, `PlanCheckout`, `AcquisitionPremiumCheckout` se ainda tiver copy própria, páginas legais de plataforma.
- Preços da landing usam `formatAppMoney` e a moeda resolvida na IX2 + catálogo da IX3.
- E-mails de aquisição e de conta (boas-vindas, verificação) nos três locales, escolhidos pelo idioma da sessão.
- Seletor de idioma/moeda com rótulos traduzidos.

**Aceite:**

- Percurso anônimo em inglês e em espanhol: landing → preço na moeda detectada → checkout, sem string solta em português (exceto nome de plano ainda não traduzido, que cai no pt-BR de propósito).
- Percurso Brasil inalterado em português e real.
- CI bloqueia chave faltante nesses namespaces.

**Fora:** miolo do app logado (IX7+).

**Entregue:** namespaces `landing`, `auth`, `checkout` e `legal` completos em pt-BR, en e es; landing SPA e estática, login, cadastro, recuperação de senha, checkout e chrome das páginas legais; preços com `formatAppMoney`; código de verificação, boas-vindas e senha no idioma da sessão (fallback pt-BR). Runbook: [`SPRINT_IX6_PUBLIC_SURFACE.md`](./SPRINT_IX6_PUBLIC_SURFACE.md).

---

## IX7 — Tradução do aplicativo

**Objetivo:** o dia a dia do usuário do CRM fica nos três idiomas.

**Entregas:**

- Namespaces `nav`, `dashboard`, `crm`, `chat`, `agenda`, `tickets`, `settings` completos.
- Shell, menu, dashboard, leads, funil, clientes, chat, agenda, tickets, configurações gerais (perfil, usuários, segurança, idioma).
- `date-fns` e `Intl` dessas telas passam pelo helper da IX1.
- Preferência de idioma no perfil, aplicada no próximo carregamento e no backend quando a tela pede texto de sistema.

**Aceite:**

- Usuário com idioma `en` navega do menu até um lead, um chat e a agenda sem rótulo fixo em português.
- O mesmo em `es`.
- Mensagens de WhatsApp e nomes de clientes permanecem como foram gravados.
- Conta `pt-BR` sem diferença visual em relação à versão anterior, além do seletor de idioma.

**Feito:** namespaces no manifesto; menu desktop e mobile; busca; dashboard, leads, clientes, funil, chat, agenda e tickets (cabeçalhos e datas); configurações (menu, perfil, usuários, segurança). `check:i18n` ok. Mensagens de WhatsApp e nomes de clientes não são traduzidos. Miolo de financeiro, contratos, loja e automações fica na IX8.

---

## IX8 — Tradução de financeiro, contratos, loja e automações

**Objetivo:** módulos de dinheiro e documento respeitam o idioma da interface e a moeda do registro.

**Entregas:**

- Namespaces `finance`, `contracts`, `proposals`, `store`, `automation` completos.
- Contas a pagar/receber, faturas de cliente, produtos, checkout público da loja, contratos, propostas, automações e chatbot (chrome da UI).
- `formatAppMoney` usa `product.currency` / moeda da fatura / moeda do contrato, não `BRL` fixo.
- Tela de gateway do tenant (Asaas, Mercado Pago, Stripe da IX5) traduzida.

**Aceite:**

- Fatura em USD aberta por usuário `en` mostra rótulos em inglês e valor em dólar.
- Fatura em BRL aberta por usuário `es` mostra rótulos em espanhol e valor em real.
- Fluxo Asaas de PIX em português permanece equivalente ao atual.

**Feito:** namespaces `finance`, `contracts`, `proposals`, `store`, `automation`. Cabeçalhos e valores dessas telas. `formatAppMoney` / `formatAppMoneyMajor` usam a moeda do registro (fatura via `gateway_metadata.currency`, produto, contrato). A API de fatura aceita `currency` opcional (`BRL` se omitida). Link público de pagamento devolve `currency`. Tela de gateways (Asaas, Mercado Pago, Stripe) traduzida. `check:i18n` ok (17 namespaces).

---

## IX9 — Super Admin, partner, e-mail, PDF e notificações

**Objetivo:** o que a plataforma envia e o que o operador interno vê também está nos três idiomas.

**Entregas:**

- Namespaces `superadmin` e `partner` completos (chrome). Conteúdo de plano continua em `plan_translations`.
- Para cada linha `platform_notification_template_system` em `pt-BR`, inserir `en` e `es` (e-mail e WhatsApp de sistema).
- Envio escolhe o locale do destinatário (preferência do usuário; senão `pt-BR`).
- PDFs de sistema (fatura da plataforma, contrato gerado pelo template de sistema) recebem locale.
- Super Admin edita override de template por locale — a API já aceita `locale`; a UI passa a listar os três.

**Aceite:**

- Evento de pagamento confirmado dispara e-mail em inglês para usuário `en` e em português para usuário `pt-BR`.
- PDF de uma cobrança USD sai com rótulos no idioma do tenant e moeda USD.
- Tela de planos do Super Admin operável em inglês (criar preço EUR inclusive).

**Fora:** traduzir anúncios já cadastrados e páginas legais que o tenant escreveu.

**Feito:** namespaces `superadmin` e `partner`. Templates `en`/`es` em `platform_notification_template_system` (migration 352). O envio usa o locale do perfil do admin do tenant, com fallback `pt-BR`. PDF da cobrança da plataforma (`/api/public/saas-billing/:token/pdf`) e o chrome do PDF de contrato usam esse idioma; o valor da cobrança sai na moeda da assinatura. O override de template no Super Admin lista `pt-BR`, `en` e `es`. `check:i18n` ok (19 namespaces).

---

## IX10 — Fechamento

**Objetivo:** declarar a cobertura e travar regressão do Brasil.

**Entregas:**

- Manifesto de namespaces: todos os acordados em `complete` para `pt-BR`, `en` e `es`. CI obrigatório no pipeline.
- Varredura de `toLocaleString('pt-BR')` e `currency: 'BRL'` **hardcoded em UI de produto**. O que sobrar entra numa lista justificada (script interno, fixture de teste, dado legado) ou vira correção nesta sprint.
- Roteiro manual:
  - BR / pt-BR / BRL / Asaas (plataforma e tenant).
  - US / en / USD / Stripe plataforma.
  - ES / es / EUR / Stripe plataforma.
  - MX / es / USD.
  - Tenant Stripe sandbox em USD e BRL.
- Runbook: flags, chaves, webhook Stripe plataforma, webhook Stripe tenant, como desligar USD/EUR sem afetar BRL.
- Nota de rollout: ligar detecção e multicurrency em produção só depois do sandbox da IX4; ligar Stripe tenant por ambiente.

**Aceite:**

- Os cinco roteiros acima passam em staging.
- Assinatura BRL antiga não muda valor, gateway nem idioma default.
- Plano sem preço numa moeda não aparece nessa moeda.
- Documento de plano e este de sprints atualizados com o status real de cada sprint.

**Feito:** os 19 namespaces acordados estão em `complete`. `npm run check:i18n` e `npm run check:i18n-hardcode` rodam no build do frontend (`Dockerfile.frontend`). A lista `scripts/i18n-hardcode-allowlist.json` trava o `pt-BR` / `BRL` que ainda resta na UI. Preço de lista BRL não muda quando o plano ganha USD/EUR (`planMulticurrency.test.ts`). Runbook, roteiro e nota de rollout em [`SPRINT_IX10_CLOSEOUT.md`](./SPRINT_IX10_CLOSEOUT.md).

---

## Ordem recomendada de kickoff

1. `ok sprint ix0`
2. `ok sprint ix1` e, em paralelo se houver capacidade, `ok sprint ix3`
3. `ok sprint ix2` (depois da IX1)
4. `ok sprint ix4` (depois da IX3) e `ok sprint ix5` (depois da IX0; pode sobrepor a IX4)
5. `ok sprint ix6` quando IX2 e os textos de checkout da IX4 estiverem estáveis
6. `ok sprint ix7` pode começar depois da IX1, em paralelo com IX4/IX5, evitando os mesmos arquivos de checkout
7. `ok sprint ix8` depois da IX5 (para a tela de gateway nascer já traduzida)
8. `ok sprint ix9` depois da IX3
9. `ok sprint ix10` por último

Estimativa de calendário, um squad: IX0–IX5 cerca de uma sprint cada; IX6–IX9 são as maiores (volume de copy) e podem ocupar mais de um ciclo se a revisão humana de `en`/`es` for gargalo. A meta de 100% está nessas quatro sprints de tradução mais o fechamento, não numa entrega única.
