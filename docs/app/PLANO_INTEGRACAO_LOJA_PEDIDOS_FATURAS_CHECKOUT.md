# 1. Resumo executivo

Objetivo da integração:
- Evoluir a loja pública de vitrine para fluxo de venda real: página única de produto -> botão Comprar -> checkout público -> criação de pedido -> criação de fatura vinculada -> operação no menu Pedidos.

Por que usar **Pedido + Fatura vinculados**:
- **Pedido** representa a operação comercial (itens, cliente, fulfillment, status operacional).
- **Fatura** representa a cobrança financeira (meio de pagamento, vencimento, status de pagamento, gateway).
- Essa separação permite evolução sem acoplamento indevido entre logística/comercial e financeiro.

Por que não usar somente fatura:
- Fatura não cobre bem ciclo operacional (separação de etapas como novo, em separação, enviado, concluído).
- Fatura pode ser paga/cancelada sem representar toda a jornada operacional do pedido.
- O próprio sistema já tem base de `orders`/`order_items`, então é mais seguro reutilizar do que forçar tudo em `customer_invoices`.

# 2. Estado atual relevante

## Frontend (rotas e telas)

- Rotas públicas da loja em `src/App.tsx`:
  - `/:storeSlug/loja` -> `PublicStore`
  - `/:storeSlug/loja/produto/:productId` -> `PublicProduct`
- Página pública de produto em `src/pages/PublicProduct.tsx`:
  - já busca produto por slug + id (`productsService.getPublicProductByStoreSlugAndProductId`).
  - CTA atual é **"Solicitar via WhatsApp"**, não checkout.
- Página pública da loja em `src/pages/PublicStore.tsx`:
  - lista itens públicos.
  - CTA por card é **"Solicitar Orçamento"** (WhatsApp), sem compra.
- Menu lateral em `src/layouts/AppLayout.tsx`:
  - grupo "Loja online" com `Catálogo`, `Pedidos (em breve)` desabilitado, `Configuração`.
- Tela de pedidos já existe (`src/pages/Orders.tsx`) e rota já existe em `src/App.tsx`:
  - `/orders` protegido por auth.
  - hoje não está conectada ao menu "Loja online".

## Frontend (services)

- `src/services/products.ts`:
  - usa APIs públicas de catálogo:
    - `GET /api/products/public/:userId`
    - `GET /api/products/public/store/:slug/product/:productId`
- `src/services/cart.ts`:
  - carrinho e pedido hoje usam APIs autenticadas:
    - `GET/POST/PATCH/DELETE /api/cart/...`
    - `POST /api/orders`
  - isso inviabiliza checkout público anônimo no formato atual.
- Checkout de plano/SaaS:
  - `src/pages/PlanCheckout.tsx`
  - `src/pages/InternalBillingCheckout.tsx`
  - fluxo é de assinatura/plano, não de compra da loja.

## Backend (rotas e controllers)

- Catálogo público:
  - `packages/backend/src/routes/productsRoutes.ts`
  - `packages/backend/src/controllers/productsController.ts`
  - detalhe público por slug + produto já existe.
- Pedidos:
  - `packages/backend/src/routes/ordersRoutes.ts`
  - `packages/backend/src/controllers/ordersController.ts`
  - já cria `orders` + `order_items` em transação.
- Carrinho:
  - `packages/backend/src/routes/cartRoutes.ts`
  - `packages/backend/src/controllers/cartController.ts`
  - totalmente sob `tenantAuthCrm` (autenticado).
- Faturas:
  - `packages/backend/src/routes/invoicesRoutes.ts` + `controllers/invoicesController.ts` (financeiro genérico legado por usuário).
  - `packages/backend/src/routes/customerInvoicesRoutes.ts` + `controllers/customerInvoicesController.ts` (fatura/cobrança CRM com gateway, mais aderente a cobrança real).
- Pagamento público já existente:
  - `packages/backend/src/routes/publicRoutes.ts`
  - `controllers/publicCustomerInvoicesController.ts`
  - `GET /api/public/customer-invoices/pay/:token` e POSTs associados.
  - tela pública em `src/pages/CustomerInvoicePay.tsx`.

## Estrutura de dados atual (tabelas)

- Em `database/init/06_create_products.sql`:
  - `products`, `store_profiles`, `shopping_carts`, `cart_items`, `orders`, `order_items`.
- Em `database/init/13_create_finance.sql`:
  - `invoices` (financeiro clássico por `user_id`).
- Em `database/init/70_customer_invoices.sql`:
  - `customer_invoices` (financeiro CRM por `tenant_id`, com status de cobrança e integração gateway).
- Em `database/init/79_customer_charges.sql`:
  - `customer_charges` e vínculo `customer_invoices.charge_id`.

## Pontos reaproveitáveis

- Página pública de produto já pronta para virar página de venda.
- Pipeline de criação de pedido (`ordersController.createOrder`) já existe.
- Pipeline de fatura com link público de pagamento já existe (`customer_invoices` + `publicRoutes` + `CustomerInvoicePay`).
- Tela administrativa de pedidos já existe (base para ativação inicial).

## Limitações atuais

- Checkout da loja ainda não existe como rota pública dedicada.
- APIs de carrinho/pedido exigem usuário autenticado.
- Não há vínculo formal pedido <-> fatura no esquema atual.
- `Orders` atual filtra por `customer_user_id` quando não recebe `storeUserId`; precisa padronização para visão do lojista.

# 3. Modelo recomendado

## Entidades e responsabilidades

- **Pedido (comercial/operacional)**  
  Fonte: `orders` + `order_items`.
- **Fatura (financeira)**  
  Fonte recomendada: `customer_invoices` (não `invoices` legado).
- **Vínculo pedido-fatura**  
  Adicionar referência explícita para rastreabilidade.

## Vínculo recomendado

Opção preferida (mais simples e segura):
- adicionar coluna em `orders`: `customer_invoice_id UUID NULL REFERENCES customer_invoices(id)`.

Campos auxiliares recomendados em `orders` (incremental):
- `checkout_token`/`checkout_id` (idempotência do checkout público).
- `source_channel` (`store_public`, etc).
- `paid_at` (espelho operacional de quitação, opcional).

## Status mínimos

Pedido (`orders.status`):
- `pending` (já existe)
- `processing` (já existe)
- `completed` (já existe)
- `cancelled` (já existe)

Pagamento do pedido (`orders.payment_status`):
- `pending` (já existe)
- `paid` (já existe)
- `failed` (já existe)

Fatura (`customer_invoices.status`):
- `pending`, `paid`, `overdue`, `cancelled` (já existe)

## Dados mínimos

Pedido:
- identificação (`id`, `order_number`)
- loja (`store_user_id`)
- cliente (`customer_name`, `customer_email`, `customer_phone`)
- itens (`order_items`)
- total (`total_amount`)
- status operacional + status de pagamento
- vínculo `customer_invoice_id`

Fatura:
- `tenant_id`
- cliente (`client_id` quando aplicável; fallback controlado para checkout sem cliente interno)
- `amount_cents`, `due_date`
- `payment_method`/`allowed_payment_methods`
- `gateway_reference_id` e token/link público
- status financeiro

# 4. Fluxo público proposto

1. Usuário acessa `/:storeSlug/loja/produto/:productId`.
2. Clica em **Comprar**.
3. Navega para checkout público da loja (nova rota pública dedicada).
4. Preenche dados mínimos de comprador.
5. Backend cria **pedido** (`orders` + `order_items`) com status `pending`/`payment_status=pending`.
6. Backend cria **fatura financeira** (`customer_invoices`) no mesmo fluxo transacional-orquestrado.
7. Backend grava vínculo pedido <-> fatura.
8. Front recebe URL/token de pagamento público e encaminha para pagamento (na própria página ou redirecionando para `CustomerInvoicePay`).
9. Webhook/consulta atualiza fatura para `paid`; rotina de sincronização atualiza pedido para `payment_status=paid` (e opcionalmente `status=processing`).

# 5. Página única do produto

## Rota recomendada

Manter rota atual:
- `/:storeSlug/loja/produto/:productId` (já existente e indexada no app).

## Dados mínimos para venda

- nome, tipo, preço, desconto, descrição
- imagens e variações (quando houver)
- disponibilidade (status/estoque quando aplicável)
- identificador do item para checkout

## Estrutura visual esperada

- bloco de mídia
- bloco de preço e benefícios
- bloco de confiança/pagamento
- CTA primário **Comprar**
- CTA secundário de contato (WhatsApp) opcional

## Compatibilidade com vitrine atual

- manter componentes/theme shell (`resolveStorefrontTheme`) como está.
- alterar apenas CTA e integração de ação (sem quebrar layout dos temas já integrados).

# 6. Checkout público

## O que já existe

- infraestrutura robusta de pagamento público por token de fatura:
  - backend: `publicRoutes` + `publicCustomerInvoicesController`
  - frontend: `src/pages/CustomerInvoicePay.tsx`

## O que falta

- endpoint público específico de **checkout da loja** (criar pedido + fatura vinculada).
- modelagem explícita do vínculo pedido-fatura.
- idempotência de criação no checkout da loja.

## Dados mínimos do checkout

- item(s): `product_id`, `quantity`, `unit_price` (validado no backend)
- comprador: nome, email, telefone (mínimo operacional)
- loja: `storeSlug`/`store_user_id` validado no servidor
- preferência de pagamento (opcional no início)

## Separação do checkout SaaS

Não misturar com:
- `/checkout` (`PlanCheckout`)
- `/saas-billing/:billingId/pay` (`InternalBillingCheckout`)
- `/api/me/tenant/*` (checkout de plano)

Checkout da loja deve usar namespace próprio, por exemplo:
- frontend: `/:storeSlug/loja/checkout` e/ou `/:storeSlug/loja/checkout/:sessionId`
- backend: `/api/store-checkout/*` (público)

# 7. Pedidos

## Como ativar o menu Pedidos

No `src/layouts/AppLayout.tsx`:
- substituir botão desabilitado "Pedidos (em breve)" por `NavLink` ativo.
- usar rota operacional existente (`/orders`) inicialmente, com evolução futura para `/admin/orders` via alias se necessário.

## Escopo inicial do painel

MVP operacional:
- listar pedidos da loja/tenant
- ver número, cliente, data, total
- ver status operacional e status de pagamento
- abrir detalhe básico (itens, contato, vínculo financeiro)

## Colunas/status mínimos

- `order_number`
- `customer_name`, `customer_email`
- `created_at`
- `total_amount`
- `status` (pedido)
- `payment_status` (pedido)
- `customer_invoice_id` (ou indicador "fatura vinculada")
- ação "Abrir fatura" (quando houver token/link ou id interno)

## Vínculo com fatura no painel

- exibir referência da fatura no card/linha.
- acesso rápido para tela financeira correspondente.
- refletir pagamento da fatura no `payment_status` do pedido.

# 8. Dependências e ordem de implantação

## Fase 1 — Modelagem mínima e contrato backend

1. Migration para vínculo `orders.customer_invoice_id`.
2. Definição de endpoint público de checkout da loja (`/api/store-checkout/create`).
3. Serviço backend para orquestrar criação pedido + fatura com idempotência.

## Fase 2 — Checkout público inicial (MVP)

1. CTA Comprar na `PublicProduct`.
2. Nova página de checkout da loja (frontend).
3. Chamada ao endpoint público para criar pedido + fatura vinculada.
4. Redirecionamento para fluxo de pagamento público já existente (`/pay/:token`) ou renderização inline reaproveitada.

## Fase 3 — Sincronização de status

1. Ao confirmar pagamento da fatura (`customer_invoices.status=paid`), atualizar `orders.payment_status=paid`.
2. Ajuste de regra operacional inicial (`orders.status` para `processing` após pagamento, opcional de MVP).
3. Auditoria/log de transição.

## Fase 4 — Ativação operacional de Pedidos

1. Ativar item de menu Pedidos.
2. Ajustar `Orders.tsx` para visão de lojista (filtro por `store_user_id`/tenant).
3. Exibir vínculo financeiro no painel.

# 9. Compatibilidade e riscos

## Reaproveitamento seguro

- Reusar:
  - `ordersController` e tabelas `orders/order_items` para operação comercial.
  - `customer_invoices` + `publicRoutes` + `CustomerInvoicePay` para financeiro/pagamento.
- Preservar rotas públicas já em produção da vitrine.

## Adaptações necessárias

- Criar vínculo explícito pedido-fatura.
- Criar endpoint público específico de checkout da loja.
- Ajustar autenticação do fluxo de compra para público (sem depender de `tenantAuthCrm`).

## Riscos de misturar pedido e fatura

- tratar pedido só como "cópia da fatura" perde rastreabilidade operacional.
- tratar fatura como "pedido" quebra clareza de domínio e manutenção.
- risco de inconsistência em cancelamento/estorno sem política de sincronização.

## Como evitar quebra de produção

- rollout por feature flag do checkout da loja.
- manter CTA WhatsApp como fallback inicial.
- migração backward-compatible (`customer_invoice_id` nullable).
- observabilidade por logs e idempotência no endpoint de criação.

# 10. Recomendação final

## Ordem ideal

1. Modelo e vínculo (dados)
2. Endpoint público de checkout da loja
3. CTA Comprar + tela checkout público
4. Criação pedido + fatura vinculada
5. Sincronização de status
6. Ativação do menu Pedidos e ajustes operacionais

## MVP recomendado

Entrar primeiro:
- página de produto com botão Comprar
- checkout público simples (1 item + dados comprador)
- criação de pedido
- criação de fatura vinculada
- pagamento via fluxo público existente de fatura

Ficar para depois:
- carrinho multi-itens completo
- regras avançadas de fulfillment/logística
- automações complexas de pós-pagamento
- expansões fora de escopo (tema, mídia, checkout SaaS, carrinho avançado cross-page)

