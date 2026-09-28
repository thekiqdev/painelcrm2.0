# Plano de execução detalhado — MVP checkout loja (1 item, pedido + fatura)

Documento base: `docs/app/PLANO_INTEGRACAO_LOJA_PEDIDOS_FATURAS_CHECKOUT.md`.

Este arquivo é **somente planejamento de sprint**: não substitui implementação nem PRs. Onde algo ainda não existe no código, está marcado como **recomendação**; onde o repositório já comporta-se de determinada forma, está marcado como **fato (código atual)**.

---

# 1. Objetivo do MVP

## O que esse MVP resolve

- Permite que um visitante **compre um único item** do catálogo público da loja, com fluxo: produto → checkout público → **pedido** criado → **fatura** criada e vinculada → **pagamento** na tela pública já existente (`/pay/:token`).
- Mantém o financeiro no modelo já consolidado do CRM (`customer_invoices`, gateway, `payment_token`) e o comercial em `orders` / `order_items`, com vínculo explícito.

## Por que começar com checkout de **1 item**

- **Fato:** `POST /api/orders` em `packages/backend/src/controllers/ordersController.ts` já aceita `items: z.array(...).min(1)` — ou seja, a API de pedido já é naturalmente “N itens”, mas o MVP fixa **N = 1** no produto e na UX para reduzir superfície (sem carrinho, sem merge de linhas, sem sessão anônima de carrinho).
- **Recomendação:** validar no backend sempre **um único** `product_id` + `quantity` no endpoint público de checkout da loja, mesmo que internamente reutilize a mesma estrutura de `order_items`.

## Por que pedido + fatura vinculados

- **Pedido** (`orders`, `order_items`): rastreio comercial (quem comprou, o quê, quantidade, preço acordado no checkout, status operacional).
- **Fatura** (`customer_invoices`): cobrança, token público (`payment_token` em `database/init/77_payment_token_customer_invoices.sql`), integração com gateway e tela `src/pages/CustomerInvoicePay.tsx`.
- Evita tratar quitacao financeira como única fonte da verdade da venda (ver argumentos no documento base, seção 1).

## Por que isso deve vir antes de carrinho multi-itens

- **Fato:** `cartRoutes` e `cartController` exigem `tenantAuthCrm` — carrinho hoje não é público; habilitar multi-item exigiria sessão anônima ou auth de comprador, reconciliação de carrinho e mais edge cases.
- **Recomendação:** entregar primeiro o caminho feliz **1 item** + mesmo padrão de pagamento público já usado em `customer_invoices`; depois evoluir para carrinho reutilizando o mesmo endpoint de “finalizar compra” com N itens.

---

# 2. Escopo exato do MVP

## 2.1 Entra nesta fase

- Página pública de produto (`src/pages/PublicProduct.tsx`) com CTA **Comprar** (além ou em substituição parcial ao fluxo WhatsApp — ver seção 7).
- Nova **rota pública** de checkout da loja no frontend (`src/App.tsx`), namespace distinto do SaaS (ver seção 4 e 8).
- **Checkout de 1 item:** formulário mínimo do comprador + confirmação de resumo (preço, loja, produto).
- **Backend:** novo endpoint **público** (sem `tenantAuthCrm` do comprador) que:
  - valida loja (`store_profiles`) + produto (`products`) + preço;
  - cria **pedido** (`orders` + `order_items`);
  - cria **fatura** (`customer_invoices`) via serviços já existentes (`customerBillingService.createManualInvoice` / fluxo equivalente);
  - persiste **vínculo** pedido → fatura (ver seção 5).
- **Redirecionamento** para pagamento público: `window.location` ou `Navigate` para `/pay/{payment_token}` (rota já em `src/App.tsx`: `/pay/:token` → `CustomerInvoicePay`), onde `payment_token` é o UUID exposto em `customer_invoices.payment_token` (**fato:** coluna e função SQL em `database/init/77_payment_token_customer_invoices.sql`).
- **Preparação** para painel/menu Pedidos: modelagem e, em subfase final, ativação do item no `src/layouts/AppLayout.tsx` e ajustes em `src/pages/Orders.tsx` (ver seção 9).

## 2.2 Não entra nesta fase

- Carrinho multi-itens e persistência em `shopping_carts` / `cart_items` para visitante anônimo.
- Checkout multi-produto, cupons, frete complexo, split de pagamento.
- Automações (e-mail, WhatsApp, estoque avançado, reserva).
- Logística avançada (rastreio, múltiplas remessas).
- Domínio customizado por tenant.
- Refatoração de mídia, temas (`src/themes/*`), ou catálogo admin além do necessário para preço visível.
- Pagamento inline “novo” se o fluxo existente de `CustomerInvoicePay` + `publicRoutes` for suficiente para o MVP.
- Qualquer mudança em checkout SaaS: `src/pages/PlanCheckout.tsx`, `src/pages/InternalBillingCheckout.tsx`, `/api/me/tenant/*`, `/api/billing/*` para cobrança de plano.

---

# 3. Diagnóstico técnico focado no MVP

## 3.1 `PublicProduct` (fato)

- **Arquivo:** `src/pages/PublicProduct.tsx`.
- Carrega `storeProfile` e `product` via `productsService.getPublicStoreBySlug` e `getPublicProductByStoreSlugAndProductId` (`src/services/products.ts`).
- Rotas públicas usadas: `GET /api/store-profile/public/slug/:slug`, `GET /api/products/public/store/:slug/product/:productId` (ver `productsRoutes.ts` / `productsController.ts`).
- CTA principal hoje: **“Solicitar via WhatsApp”** quando há `contact_whatsapp`; não há “Comprar” nem navegação para checkout.

## 3.2 Rotas públicas da loja (fato)

- **Arquivo:** `src/App.tsx`.
  - `/:storeSlug/loja` → `PublicStore`.
  - `/:storeSlug/loja/produto/:productId` → `PublicProduct`.
- Pagamento público de fatura (não loja): `/pay/:token` → `CustomerInvoicePay`.

## 3.3 `orders` e `order_items` (fato)

- **Definição SQL:** `database/init/06_create_products.sql`.
  - `orders`: `order_number`, `store_user_id`, `customer_user_id`, dados do cliente, `total_amount`, `status`, `payment_method`, `payment_status`, etc.
  - `order_items`: `order_id`, `product_id`, snapshot `product_name`, `product_type`, preços, `selected_variation`.
- **Não existe** hoje coluna `customer_invoice_id` em `orders` — **recomendação MVP:** adicionar via nova migration em `database/init/` + entrada em `packages/backend/src/migrate.ts`.

## 3.4 Criação de pedidos hoje (fato)

- **Rota:** `packages/backend/src/routes/ordersRoutes.ts` — `POST /` com `tenantAuthCrm`.
- **Controller:** `packages/backend/src/controllers/ordersController.ts` — `createOrder`:
  - exige `tenantId` e `req.userId` (comprador autenticado como usuário CRM);
  - valida que `product_id` pertence ao tenant;
  - insere `orders` com `customer_user_id = userId` do JWT;
  - insere `order_items`;
  - limpa `cart_items` se existir carrinho para `store_user_id` + `user_id`.
- **Limitação para MVP loja:** comprador público **não** tem JWT CRM — o fluxo atual de `createOrder` **não** serve diretamente como endpoint público sem adaptação (novo handler público ou serviço compartilhado com outro contexto de auth).

## 3.5 `customer_invoices` (fato)

- Tabela criada/evoluída em `database/init/70_customer_invoices.sql` e migrações seguintes; coluna **`payment_token`** em `77_payment_token_customer_invoices.sql`.
- **API autenticada:** `packages/backend/src/routes/customerInvoicesRoutes.ts` — `POST /api/customer-invoices` → `customerInvoicesController.createCustomerInvoice` → `createManualInvoice` / `createRecurringManualInvoice` em `packages/backend/src/services/customerBillingService.ts`.
- **Comportamento observado no código:** `createManualInvoice` com `client_id` ausente chama `createManualCustomerInvoice` com `client_id: null` e retorna `{ invoice }` sem passar por gateway no ramo documentado no comentário (“fatura por link”) — **recomendação:** na execução, confirmar se nesse ramo o `payment_token` é sempre gerado e se o fluxo público `/pay/:token` cobre loja; se não, ajustar apenas o serviço de criação no passo de implementação (fora do escopo deste doc, mas o passo 5 depende disso).

## 3.6 Fluxo público de pagamento por token (fato)

- **Backend:** `packages/backend/src/routes/publicRoutes.ts` — prefixo `/api/public`:
  - `GET /customer-invoices/pay/:token`
  - `POST .../complete`, `switch-method`, `pay-with-card`.
- **Frontend:** `src/pages/CustomerInvoicePay.tsx` — chama `apiClient.get('/api/public/customer-invoices/pay/${token}')`.

## 3.7 Menu e tela de pedidos (fato)

- **Menu:** `src/layouts/AppLayout.tsx` — “Loja online” → “Pedidos (em breve)” **desabilitado**.
- **Rota admin existente:** `src/App.tsx` — `/orders` com auth → `src/pages/Orders.tsx`.
- **Orders.tsx:** usa `cartService.getOrders()` → `GET /api/orders` (`src/services/cart.ts`). Lista pedidos com filtros locais; botões “Ver Detalhes” / “Processar Pedido” sem navegação completa mapeada no trecho atual.
- **Limitação:** `getOrders` no controller, sem `storeUserId`, filtra por `customer_user_id = userId` — visão de **comprador**, não de **lojista**. MVP operacional exige filtro por `store_user_id` alinhado ao dono da loja (ver seção 9).

## 3.8 Arquivos, rotas e serviços — lista objetiva

| Área | Artefato |
|------|----------|
| Frontend rotas | `src/App.tsx` |
| Frontend produto | `src/pages/PublicProduct.tsx`, `src/pages/PublicStore.tsx` |
| Frontend pagamento | `src/pages/CustomerInvoicePay.tsx` |
| Frontend pedidos | `src/pages/Orders.tsx`, `src/layouts/AppLayout.tsx` |
| Frontend API | `src/services/products.ts`; **novo** service de checkout loja (recomendação) |
| Backend mount | `packages/backend/src/index.ts` (`/api/products`, `/api/orders`, `/api/customer-invoices`, `/api/public`) |
| Backend produtos | `packages/backend/src/routes/productsRoutes.ts`, `controllers/productsController.ts` |
| Backend pedidos | `packages/backend/src/routes/ordersRoutes.ts`, `controllers/ordersController.ts` |
| Backend faturas | `packages/backend/src/routes/customerInvoicesRoutes.ts`, `controllers/customerInvoicesController.ts`, `services/customerBillingService.ts` |
| Backend público | `packages/backend/src/routes/publicRoutes.ts`, `controllers/publicCustomerInvoicesController.ts` |
| DB | `database/init/06_create_products.sql`, `70_customer_invoices.sql`, `77_payment_token_customer_invoices.sql`, … |
| Migrações runner | `packages/backend/src/migrate.ts` |

---

# 4. Decisões técnicas do MVP

Todas abaixo são **recomendações de execução** para o time implementar, salvo onde indicado como fato.

## 4.1 Rota pública de checkout (frontend)

- **Recomendação:** `/:storeSlug/loja/checkout`  
  - Query params: `?productId=<uuid>&qty=1` (fixar `qty=1` no MVP; validar no backend).
- **Motivo:** mantém prefixo `/loja` como namespace da vitrine; não colide com `/checkout` (plano) nem `/pay/:token`.

## 4.2 Botão Comprar

- **Recomendação:** `Link` ou `navigate` para `/${storeSlug}/loja/checkout?productId=${product.id}`.
- **Pré-condições de UI:** exibir Comprar apenas se produto tiver preço vendável no MVP (ex.: `price` ou `discount_price` coerente — regra exata no passo de implementação).
- **Fallback:** manter WhatsApp como CTA secundário (**fato:** já existe em `PublicProduct.tsx`).

## 4.3 Validação de produto e loja no backend

- **Recomendação:** no endpoint público de checkout:
  1. Resolver `tenant_id` / `store_user_id` via `store_profiles.store_slug = :storeSlug` e `user_id` do dono da loja.
  2. Carregar produto por `id` e garantir: `user_id = store_user_id`, `status = 'active'`, `is_public = true` (espelhar regras de `getPublicProductByStoreSlugAndProductId` em `productsController.ts`).
  3. Calcular `unit_price` no servidor a partir de `price` / `discount_price` (não confiar no preço enviado pelo cliente, exceto talvez como hint para diff — **recomendação:** não aceitar `unit_price` do body no MVP).

## 4.4 Criação do pedido

- **Recomendação:** extrair lógica de inserção em função de serviço reutilizável (ex. `createStoreOrderForPublicCheckout`) chamada pelo novo controller público, com:
  - `store_user_id` = dono da loja;
  - `customer_user_id` = **NULL** para comprador anônimo (**fato:** coluna permite NULL em `06_create_products.sql`);
  - `customer_name`, `customer_email`, `customer_phone` do formulário;
  - `status = 'pending'`, `payment_status = 'pending'` (**fato:** mesmo padrão que `createOrder` já usa);
  - um item em `order_items` com quantidade 1 (MVP).

## 4.5 Criação da fatura

- **Recomendação:** usar pipeline de `customer_invoices`:
  - Montar `items[]` com descrição (nome do produto), `quantity`, `unit_price_cents`, `product_id` se o schema de itens permitir (**fato:** `customerInvoicesController` referencia `product_id` em itens).
  - `due_date`: hoje + N dias (configurável).
  - `client_id`: **null** no MVP se o fluxo “fatura por link” for aceitável; comprador completa dados em `/pay/:token` se `needs_customer` (**fato:** `CustomerInvoicePay.tsx` trata `needs_customer`).
- **Alternativa (se negócio exigir cliente CRM antes do pagamento):** criar ou resolver `clients` a partir do e-mail — **fora do escopo mínimo**; documentar como pendência se gateway exigir CPF no primeiro passo.

## 4.6 Vínculo pedido ↔ fatura

- **Recomendação:** migration adiciona `orders.customer_invoice_id UUID NULL REFERENCES customer_invoices(id)`.
- Após criar fatura, `UPDATE orders SET customer_invoice_id = $1 WHERE id = $2` na mesma transação ou transação 2PC com compensação — **recomendação:** uma transação DB envolvendo pedido + update vínculo + insert fatura se o serviço de fatura permitir; caso serviço de fatura faça I/O externo (gateway), usar padrão **saga leve**: criar pedido → criar fatura → atualizar pedido; job de reconciliação se falhar o passo 3.

## 4.7 Redirecionamento para pagamento

- **Recomendação:** resposta JSON do checkout público inclui `payment_token` (UUID) e frontend redireciona para `/pay/${payment_token}` (**fato:** rota existe em `App.tsx`).
- **Não** reutilizar `/checkout` (PlanCheckout).

## 4.8 Separação do checkout SaaS

- Prefixos distintos: loja `/:storeSlug/loja/...` vs plano `/checkout`, `/saas-billing/...`.
- Backend: novo prefixo sugerido `/api/store-checkout/...` ou `/api/public/store/...` — **não** montar sob `/api/me/tenant` nem `/api/plan-purchase`.

## 4.9 Compatibilidade e segurança

- **Rate limit:** reutilizar `express-rate-limit` já aplicado em `packages/backend/src/index.ts` para `/api/`; avaliar limite mais estrito para o novo endpoint público POST.
- **Idempotência:** header `Idempotency-Key` opcional no POST de checkout para evitar duplo pedido em double-submit (**recomendação**).
- **CSRF:** SPA pública em mesmo site — risco menor; ainda assim validar origem se necessário.
- **Multi-tenant:** toda query deve amarrar produto ao `user_id` da loja derivado do slug — nunca aceitar `tenant_id` do cliente.

---

# 5. Modelo de dados mínimo recomendado

## 5.1 Pedido (`orders`)

**Fato (já existente):** campos em `06_create_products.sql`.

**Recomendação (MVP):** adicionar:

- `customer_invoice_id UUID NULL REFERENCES customer_invoices(id)` — vínculo preferido.
- Opcional: `public_checkout_idempotency_key TEXT NULL UNIQUE` ou tabela auxiliar — para replay seguro.

**Valores MVP sugeridos:**

- `store_user_id`: UUID do dono da loja (FK `users`).
- `customer_user_id`: `NULL`.
- `customer_name`, `customer_email`, `customer_phone`: formulário.
- `total_amount`: alinhado ao total da fatura (centavos convertidos para decimal coerente com coluna atual).
- `status`: `pending`.
- `payment_status`: `pending` até webhook/polling refletir pagamento da fatura.

## 5.2 Fatura (`customer_invoices`)

**Fato:** tabela com `tenant_id`, `amount_cents`, `due_date`, `status`, `payment_token`, etc.

**Recomendação MVP:**

- `amount_cents`: derivado do preço do produto × quantidade (1).
- `payment_token`: deve estar preenchido para redirecionar a `/pay/:token` (**validar na implementação** o ramo `client_id null`).
- `description`: texto curto com referência ao pedido (ex. número `order_number`) para suporte.

## 5.3 Vínculo

- **Preferência:** `orders.customer_invoice_id` → `customer_invoices.id` (**recomendação explícita do produto**).
- **Motivo para não inverter como principal:** pedido é a âncora comercial; uma fatura futura poderia teoricamente agregar múltiplos pedidos — não é MVP, mas `customer_invoice_id` no pedido é o mais simples.

---

# 6. Fluxo detalhado do MVP (passo a passo)

1. Usuário abre `/:storeSlug/loja/produto/:productId` (`PublicProduct`).
2. Clica **Comprar** → navega para `/:storeSlug/loja/checkout?productId=...&qty=1`.
3. Tela de checkout carrega resumo (nome loja, produto, preço) via API pública de leitura **ou** reaproveita dados em state/navigation state — **recomendação:** refetch público do produto para evitar tampering.
4. Usuário preenche nome, e-mail, telefone (mínimo); aceita termos se necessário (opcional MVP).
5. **POST** endpoint público de checkout: valida slug, produto, preço, estoque se aplicável.
6. Servidor cria registro em `orders` + `order_items`.
7. Servidor cria `customer_invoices` + itens + garante `payment_token`.
8. Servidor atualiza `orders.customer_invoice_id` e retorna `{ payment_token, order_id, order_number }`.
9. Frontend `navigate('/pay/' + payment_token)` ou `window.location.assign`.
10. Pagamento aprovado: fluxo existente atualiza `customer_invoices.status` (**fato:** webhooks/polling já previstos no módulo financeiro — confirmar no passo de implementação o gatilho exato).
11. **Recomendação:** listener assíncrono (job ou hook pós-webhook) atualiza `orders.payment_status = 'paid'` e opcionalmente `status = 'processing'` quando `customer_invoices.status = 'paid'`. Se não houver hook, MVP pode aceitar **atualização lazy** ao abrir painel Pedidos (não ideal — documentar débito técnico).

---

# 7. Página pública de produto

## O que precisa mudar (recomendação)

- Incluir botão **Comprar** visível quando o produto for elegível (preço público, ativo — critério a cravar no refinamento).
- `navigate`/`Link` para rota de checkout da loja com `storeSlug` + `productId`.

## CTA Comprar

- Primário: Comprar.
- Secundário: manter WhatsApp (**fato:** já implementado).

## Dados mínimos na página

- **Fato:** já exibidos — nome, tipo, descrição, preço, galeria, características, loja.

## O que permanece

- `ProductShell` / temas (`resolveStorefrontTheme`) — **não refatorar** layout agora.
- Fluxo de erro 404 e link “voltar à loja”.

## O que não refatorar agora

- Estrutura de `PublicStore.tsx` além do necessário.
- Temas `src/themes/*`.

---

# 8. Checkout público

## Rota recomendada

- `/:storeSlug/loja/checkout` (**recomendação**), registrada em `src/App.tsx` **sem** `AuthGuard`.

## Dados mínimos do formulário

- Nome completo, e-mail, telefone (opcional no MVP apenas se gateway tolerar — **validar na implementação**).
- Exibir resumo somente leitura: produto, preço total, nome da loja.

## Validação

- Client-side: formato de e-mail, campos obrigatórios.
- Server-side: todas as regras de preço e elegibilidade (fonte de verdade).

## UX mínima

- Estados: loading, erro de API, sucesso → redirect.
- Mensagem clara se loja inativa ou produto indisponível.

## Separação checkout SaaS

- Não importar componentes de `PlanCheckout` / `InternalBillingCheckout` para este fluxo.
- Copy da página: “Checkout da loja” / nome da loja — evitar termos “plano”, “assinatura”.

## Reaproveitamento do pagamento público

- **Fato:** `CustomerInvoicePay` + `/api/public/customer-invoices/pay/:token` — reutilizar integralmente após obter `payment_token`.

---

# 9. Pedidos

## Quando ativar o menu

- **Recomendação:** **subfase imediatamente após** fluxo ponta a ponta de compra + pagamento validado em staging:
  - **Passo 6** do plano de execução (abaixo) pode ser dividido em **6a** (backend lista pedidos do lojista) e **6b** (habilitar menu).

## `Orders.tsx` para a loja

- **Recomendação:**
  - Chamar `GET /api/orders?storeUserId=<dono_loja>` quando usuário logado for dono da loja ou tiver permissão de módulo produtos/loja (**fato:** `getOrders` já aceita `storeUserId` query em `ordersController.ts`).
  - Exibir coluna **Fatura** (link para `/customer-invoices/:id` ou indicador “pago via link” se só houver token).
  - Mapear `payment_status` da fatura ou do pedido — definir fonte única na implementação.

## Colunas / status iniciais

- `order_number`, data, cliente (nome/e-mail), total, `status` operacional, `payment_status`, referência fatura / pagamento.

---

# 10. Plano de execução em passos

## Passo 1 — preparar modelagem e vínculo pedido-fatura

| Item | Detalhe |
|------|---------|
| **Arquivos** | Novo `database/init/10X_orders_customer_invoice_id.sql` (número sequencial livre); `packages/backend/src/migrate.ts` |
| **Ações** | `ALTER TABLE orders ADD COLUMN customer_invoice_id UUID NULL REFERENCES customer_invoices(id)`; índice; comentário |
| **Dependências** | Backup/CI de migração |
| **Risco** | Baixo; coluna nullable preserva compat |

## Passo 2 — criar endpoint público de checkout da loja

| Item | Detalhe |
|------|---------|
| **Arquivos** | Novo `packages/backend/src/routes/storeCheckoutRoutes.ts` (ou nome acordado); novo `controllers/storeCheckoutController.ts` ou `publicStoreCheckoutController.ts`; registrar em `packages/backend/src/index.ts` **antes** de 404; possível novo `services/storeCheckoutService.ts` |
| **Ações** | `POST /api/public/store-checkout` ou `POST /api/store-checkout/public` com body `{ store_slug, product_id, quantity, customer: { name, email, phone } }`; validações; transação/saga pedido+fatura; retorno `payment_token` + ids |
| **Dependências** | Passo 1; entendimento do `createManualCustomerInvoice` / token |
| **Risco** | Médio — superfície pública; mitigar com rate limit + validação rigorosa |

## Passo 3 — criar tela pública de checkout de 1 item

| Item | Detalhe |
|------|---------|
| **Arquivos** | Novo `src/pages/PublicStoreCheckout.tsx` (nome sugerido); `src/App.tsx`; opcional `src/services/storeCheckout.ts` |
| **Ações** | Formulário + POST para endpoint; redirect `/pay/:token`; tratamento de erros |
| **Dependências** | Passo 2 deployado em ambiente de dev |
| **Risco** | Baixo/médio — UX e CORS já cobertos pelo mesmo frontend |

## Passo 4 — ligar botão Comprar em `PublicProduct`

| Item | Detalhe |
|------|---------|
| **Arquivos** | `src/pages/PublicProduct.tsx` |
| **Ações** | CTA Comprar → rota checkout; condicionar exibição |
| **Dependências** | Passo 3 |
| **Risco** | Baixo |

## Passo 5 — conectar com pagamento público existente

| Item | Detalhe |
|------|---------|
| **Arquivos** | Possivelmente `publicCustomerInvoicesController.ts` / serviço de criação de fatura se `payment_token` não for gerado no ramo sem cliente |
| **Ações** | Garantir que toda fatura criada pelo checkout loja tenha `payment_token` utilizável em `CustomerInvoicePay` |
| **Dependências** | Passo 2 |
| **Risco** | Alto se integração gateway assumir `client_id` sempre — **validar cedo** |

## Passo 6 — preparar pedidos para operação

| Item | Detalhe |
|------|---------|
| **Arquivos** | `src/pages/Orders.tsx`, `src/services/cart.ts` ou novo service; `ordersController.ts` se precisar incluir `customer_invoice_id` no SELECT; `src/layouts/AppLayout.tsx` |
| **Ações** | Listagem lojista via `storeUserId`; exibir vínculo fatura; habilitar item Pedidos |
| **Dependências** | Passos 1–5 estáveis |
| **Risco** | Médio — permissões (`RequireModuleView`, `pathToModule`) |

## Passo 7 — validação final e rollout

| Item | Detalhe |
|------|---------|
| **Arquivos** | Feature flag (env) opcional no backend + frontend; documentação `env.example` |
| **Ações** | Testes da seção 13; canário; monitoração erros 4xx/5xx no novo endpoint |
| **Dependências** | Todos os passos |
| **Risco** | Operacional |

---

# 11. Arquivos impactados

## Frontend

| Arquivo | Motivo | Tipo de mudança |
|---------|--------|-----------------|
| `src/App.tsx` | Rota checkout público | Adição |
| `src/pages/PublicProduct.tsx` | CTA Comprar | Alteração |
| `src/pages/PublicStoreCheckout.tsx` (novo) | UI checkout 1 item | Novo |
| `src/services/storeCheckout.ts` (novo) | POST checkout | Novo |
| `src/pages/Orders.tsx` | Visão lojista, colunas | Alteração |
| `src/layouts/AppLayout.tsx` | Ativar Pedidos | Alteração |
| `src/components/RequireModuleView.tsx` | Opcional: mapear `/orders` se rota mudar | Alteração condicional |

## Backend

| Arquivo | Motivo | Tipo de mudança |
|---------|--------|-----------------|
| `packages/backend/src/index.ts` | Montar rota checkout loja | Alteração |
| Novo routes/controller/service checkout loja | Orquestração pública | Novo |
| `packages/backend/src/controllers/ordersController.ts` | Opcional: extrair serviço compartilhado | Refatoração leve |
| `packages/backend/src/services/customerBillingService.ts` | Ajuste garantir token/link para loja | Alteração condicional |

## Banco / modelagem

| Artefato | Motivo | Tipo |
|----------|--------|------|
| `database/init/*.sql` + `migrate.ts` | `orders.customer_invoice_id` | Novo script |

## Testes

| Área | Motivo |
|------|--------|
| Novo teste integração API checkout | Regressão segurança |
| Opcional e2e manual | Fluxo completo (seção 13.3) |

---

# 12. Compatibilidade e deprecação

- **Continua funcionando:** vitrine `PublicStore` / `PublicProduct`, APIs públicas de produto, `POST /api/orders` autenticado (admin/comprador CRM), faturas manuais, `/pay/:token`, checkout SaaS.
- **Será ampliado:** modelo `orders` (nova FK), novo endpoint público.
- **Conflito com SaaS:** evitado por URL e prefixo API distintos (seção 4.8).
- **Rotas públicas atuais:** preservadas; apenas **adição** de rota checkout.
- **WhatsApp:** manter como fallback (seção 7).
- **Produção:** migrations nullable + feature flag reduzem risco.

---

# 13. Testes do MVP

## 13.1 Testes backend

- Produto inexistente ou de outra loja → 404 ou 400.
- Produto `inactive` ou `is_public = false` → recusa.
- Preço zero ou inválido → recusa (se política de negócio exigir).
- Pedido criado com 1 item e totais corretos.
- Fatura criada com `amount_cents` coerente.
- `orders.customer_invoice_id` preenchido após sucesso.
- Duplo POST com mesmo `Idempotency-Key` → um pedido (se implementado).
- Tentativa de SQL injection / UUID inválido no slug ou product_id.

## 13.2 Testes frontend

- Comprar navega para checkout com query correta.
- Submit válido redireciona para `/pay/:token`.
- Erros de API exibem mensagem sem quebrar layout.
- `PublicProduct` sem preço (se política esconder Comprar) não mostra CTA quebrado.

## 13.3 Testes manuais

- Produto válido, loja ativa — fluxo completo até pagamento teste/sandbox.
- Produto inativo — bloqueio.
- Produto privado — bloqueio.
- Slug inválido — bloqueio.
- Manipular `productId` na URL do checkout — bloqueio no backend.
- Pagar via tela pública — fatura `paid`.
- Abrir `Orders` como lojista — pedido listado e vínculo com fatura visível.

---

# 14. Rollout e mitigação

- **Controle por loja (regra atual):** checkout público da vitrine depende só de `store_profiles.is_active` e `store_profiles.store_checkout_enabled` (Admin → Loja). Não há feature flag global de ambiente para esse fluxo.
- **Staging:** deploy API + migration + frontend; testar com gateway sandbox.
- **Canário:** habilitar o switch de checkout só nas lojas de teste no admin.
- **Reverter:** desligar checkout na loja no admin; o endpoint continua existindo mas responde 403 para lojas sem checkout habilitado.
- **Antes de ativar menu Pedidos:** pelo menos um pedido de teste visível com `storeUserId` correto e documentação para suporte.

---

# 15. Critérios de aceite

- [ ] Página pública do produto exibe botão **Comprar** (quando elegível) e leva ao checkout da loja.
- [ ] Existe rota pública de checkout de **1 item** com formulário mínimo.
- [ ] `POST` checkout cria **pedido** em `orders` + **item** em `order_items`.
- [ ] É criada **fatura** em `customer_invoices` utilizável pelo fluxo existente.
- [ ] `orders.customer_invoice_id` aponta para a fatura criada (após migration).
- [ ] Usuário é redirecionado para `/pay/:token` e consegue pagar (ambiente configurado).
- [ ] Checkout SaaS (`/checkout`, `/saas-billing/...`) permanece isolado e não regressiona.
- [ ] Não há dependência de login do **comprador** para concluir o MVP.
- [ ] (Subfase) Menu **Pedidos** ativo e listagem útil para o lojista.
- [ ] WhatsApp permanece disponível como alternativa (se já era requisito de produto).

---

# 16. Pendências para fase seguinte

- Carrinho multi-itens e uso de `shopping_carts` / `cart_items` para anônimos ou logados.
- Checkout com múltiplos produtos, frete, descontos.
- Sincronização automática robusta pedido ↔ fatura (webhook único, sem lazy refresh).
- Painel de pedidos rico (detalhe, timeline, impressão, export).
- Criação obrigatória de `clients` no CRM no momento da compra.
- Estoque reservado / baixa automática.
- Emails transacionais e integrações externas.

---

**Fim do documento de execução MVP.**
