# Diagnóstico técnico e funcional — módulo de produtos e serviços

**Escopo:** estado observado no repositório (frontend Vite/React, backend Express em `packages/backend`, SQL em `database/init` e migrações Supabase).  
**Objetivo:** mapear implementação real, riscos e base para evolução (incl. integração com chat).  
**Não implementa alterações** — fatos citados referem-se ao código na data deste documento.

---

## 1. Visão geral do módulo

### 1.1 Finalidade atual

- Cadastro e manutenção de itens de catálogo com discriminação **`product` | `service`** na mesma entidade (`products`).
- Apoio à **loja pública** (slug + listagem pública) e a fluxos de **carrinho/pedido** no backend.
- **Perfil de loja** (`store_profiles`) acoplado ao mesmo fluxo de serviços no front (`productsService`).
- Uso **secundário** em **faturas de cliente**: linhas podem referenciar produtos via `productsService.getProducts()` (ex.: tela embutida no chat).

### 1.2 Onde aparece no sistema

| Contexto | Onde |
|----------|------|
| Menu lateral | `src/layouts/AppLayout.tsx` — item “Produtos” com feature flag `products` e permissão `canView('products')`, link **`/products`**. |
| Rotas autenticadas | `src/App.tsx`: `/admin/products`, `/admin/products/new`, `/admin/products/:id/edit` e rotas legadas `/products`, `/products/new`, `/products/edit/:id` (mesmas páginas). |
| Loja pública | `src/pages/PublicStore.tsx`, `src/pages/PublicProduct.tsx`; rotas públicas definidas no mesmo `App.tsx` (lazy). |
| Chat | `src/pages/Chat.tsx` incorpora `CustomerInvoiceNew`, que chama `productsService.getProducts()` — **não** há serviço dedicado de “catálogo para o chat”. |
| Busca global (CRM) | `packages/backend/src/controllers/searchController.ts` — tipo `products`. |
| Dashboard | `packages/backend/src/controllers/dashboardController.ts` — contagem de produtos por tenant. |

### 1.3 Tipos suportados

- **Dois tipos exclusivos** no banco e no Zod: `'product'` ou `'service'` (`CHECK (type IN ('product', 'service'))` em `database/init/06_create_products.sql`).
- **Não** existe tipo “produto e serviço” simultâneo; o usuário escolhe um card no formulário (`src/pages/ProductForm.tsx`).
- **Variações:** apenas para `type === 'product'` na UI; persistidas em JSONB `variations`. Campos de UI `pricing_mode` e `variation_prices` existem no tipo TS e no formulário, mas **não** constam do schema Zod do backend — ver seção 5.

---

## 2. Fluxo funcional atual

### 2.1 Criar

- **Tela principal:** `src/pages/ProductForm.tsx` (rotas `/admin/products/new` ou `/products/new`).
- Fluxo: escolha tipo → informações básicas → preços/estoque (produto) ou duração/recorrência (serviço) → imagens (placeholder) → variações (só produto) → contrato (só serviço) → características → público/privado → submit.
- **Serviço HTTP:** `src/services/products.ts` — `POST /api/products`.
- **Backend:** `createProduct` em `packages/backend/src/controllers/productsController.ts` — validação Zod `productSchema`, permissão `assertModulePermission(..., 'products', 'create', ...)`, `user_id` via `ensureUserIdForInsert(req)`.
- **Comportamento explícito no client:** `createProduct` **força** `status: 'active'` no body (`src/services/products.ts`), ignorando rascunho/inativo na criação pelo formulário padrão.

### 2.2 Editar

- **Rota:** `/admin/products/:id/edit` ou `/products/edit/:id` — `ProductForm` usa `useParams().id`.
- **GET** detalhe: `productsService.getProductById` → `GET /api/products/:id`.
- **PATCH:** `productsService.updateProduct` → `PATCH /api/products/:id` com `productSchema.partial()`.
- Permissões no update/delete: `assertModulePermission` com `ownerId` / `assigneeId` (`responsible_id`) para `edit_own_only` / regras de módulo.

### 2.3 Excluir / inativar

- **Exclusão física:** lista em `src/pages/Products.tsx` → `confirm` → `productsService.deleteProduct` → `DELETE /api/products/:id` (`deleteProduct` no controller).
- **Inativação / rascunho:** campos `status` existem no modelo e no backend, porém **não** há na UI da listagem ou do `ProductForm` observado controle explícito para `inactive` ou `draft` (badge na lista só distingue “Ativo” vs “Inativo” de forma binária com `active` vs resto).

### 2.4 Listar

- **Painel:** `src/pages/Products.tsx` — `getProducts()` sem paginação; ordenação **no servidor** `ORDER BY created_at DESC` (`getProducts` no controller).
- **Escopo tenant:** `joinUserTenant` com `tenantId` (`getProducts`).

### 2.5 Busca / filtro

- **Na tela de produtos:** não há busca, filtro por tipo ou categoria no cliente além do que vier na lista completa.
- **Busca global CRM:** `GET /api/search?q=...&types=...` — produtos com `ILIKE` em `name` e `description`, limite 5, rota retornada **`/products`** (não `/admin/products`). Implementação: `searchController.ts`.

### 2.6 Categorias

- Campo **livre** `category TEXT` (uma string por registro); input texto em `ProductForm` e no `ProductFormDialog`.
- Índice `idx_products_category` em `06_create_products.sql`.
- **Não** há tabela de categorias, hierarquia nem validação de valores.

### 2.7 Campos por tela e por tipo

**`ProductForm.tsx` (fonte principal)**

| Área | Produto | Serviço |
|------|---------|---------|
| Nome, categoria, descrições curta/long | Sim | Sim |
| Preço de venda (obrigatório na UI) | Sim | Sim |
| Custo, SKU, promo, estoque | Sim | Não |
| Duração (h), recorrência | Não | Sim |
| Imagens principais / secundárias | UI placeholder (sem upload real) | Só principais (placeholder) |
| Variações + preço por combinação | Sim | Não |
| Contrato / template | Não | Sim |
| Características (`features`) | Sim | Sim |
| Público (`is_public`) | Sim | Sim |
| Responsável (`responsible_id`) | Estado inicializado/carregado | Idem — **sem controle na UI** |

**`ProductFormDialog.tsx`**

- Wizard em 3 passos; campos **reduzidos** (tipo, nome, categoria, descrição, preço, duração para serviço, features, público).
- **Não** há importação deste componente em outras páginas do `src` (apenas referências em documentação de migração) — tratar como **código legado / não integrado** às rotas atuais.

**`Products.tsx` (lista)**

- Exibe `description` (não `short_description`), preço, categoria, tipo, status simplificado, ações editar/excluir.

---

## 3. Mapeamento técnico

### 3.1 Frontend — arquivos principais

| Arquivo | Papel |
|---------|--------|
| `src/pages/Products.tsx` | Lista, exclusão, link loja, diálogo config loja |
| `src/pages/ProductForm.tsx` | CRUD completo (UI) |
| `src/components/products/StoreConfigDialog.tsx` | CRUD perfil loja |
| `src/components/products/ProductFormDialog.tsx` | Formulário alternativo (não referenciado nas rotas) |
| `src/components/products/ShoppingCart.tsx` | Tipos carrinho |
| `src/services/products.ts` | Cliente API produtos + loja pública |
| `src/types/products.ts` | Tipos TS (incl. `pricing_mode`, `variation_prices` não persistidos no backend) |
| `src/pages/PublicStore.tsx` / `PublicProduct.tsx` | Vitrine |
| `src/pages/CustomerInvoiceNew.tsx` | Lista produtos para linhas de fatura (incl. modo embutido no chat) |
| `src/services/search.ts` | Busca global |
| `src/layouts/AppLayout.tsx` | Nav + feature flag |
| `src/components/RequireModuleView.tsx` | Gate de `can_view` por path |

### 3.2 Backend — arquivos principais

| Arquivo | Papel |
|---------|--------|
| `packages/backend/src/controllers/productsController.ts` | CRUD + listagem pública |
| `packages/backend/src/routes/productsRoutes.ts` | Rotas Express |
| `packages/backend/src/controllers/storeProfileController.ts` | Perfil da loja |
| `packages/backend/src/routes/storeProfileRoutes.ts` | Rotas loja |
| `packages/backend/src/controllers/cartController.ts` | Carrinho (JOIN `products`) |
| `packages/backend/src/controllers/ordersController.ts` | Pedidos; valida produtos no tenant |
| `packages/backend/src/controllers/searchController.ts` | Busca produtos |
| `packages/backend/src/controllers/dashboardController.ts` | Métricas |
| `packages/backend/src/services/modulePermissionsService.ts` | Módulo `products` + `edit_own` / `delete_own` |
| `packages/backend/src/services/tenantUserRemovalService.ts` | `UPDATE products SET responsible_id = NULL` ao remover usuário |
| `packages/backend/src/utils/tenantScope.js` | Escopo multi-tenant nas queries |
| `packages/backend/src/index.ts` | `app.use('/api/products', productsRoutes)` |

### 3.3 Endpoints REST (produtos e loja)

**Produtos** (`productsRoutes.ts`):

| Método | Rota | Auth | Handler |
|--------|------|------|---------|
| GET | `/api/products/public/:userId` | Não | `getPublicProducts` |
| GET | `/api/products/` | `tenantAuthCrm` | `getProducts` |
| GET | `/api/products/:id` | `tenantAuthCrm` | `getProductById` |
| POST | `/api/products/` | `tenantAuthCrm` | `createProduct` |
| PATCH | `/api/products/:id` | `tenantAuthCrm` | `updateProduct` |
| DELETE | `/api/products/:id` | `tenantAuthCrm` | `deleteProduct` |

**Loja** (`storeProfileRoutes.ts`): `GET /api/store-profile/public/:userId`, `GET /api/store-profile/public/slug/:slug` (público); CRUD autenticado em `/api/store-profile`.

**Carrinho / pedidos** (vinculação): rotas em `cartRoutes.ts`, `ordersRoutes.ts` — montagem em `index.ts` (não repetido aqui linha a linha).

### 3.4 Services / use cases / helpers

- **Não** há camada de use case separada para produtos: lógica nos **controllers** + SQL direto com `pool.query`.
- **Frontend:** classe `ProductsService` em `src/services/products.ts` (sem React Query dedicado ao módulo na listagem — uso local de `useState`/`useEffect` nas páginas).

### 3.5 Tabelas de banco envolvidas

Definidas em `database/init/06_create_products.sql` (e alinhadas conceitualmente às migrações Supabase iniciais):

- **`products`** — núcleo do módulo.
- **`store_profiles`** — configuração da vitrine (1 por `user_id`).
- **`shopping_carts`**, **`cart_items`** — carrinho.
- **`orders`**, **`order_items`** — pedidos; `order_items` guarda snapshot `product_name`, `product_type`, `selected_variation`.

### 3.6 Schema atual dos campos (`products`)

Colunas em `06_create_products.sql`:

| Coluna | Tipo | Notas |
|--------|------|--------|
| `id` | UUID PK | |
| `user_id` | UUID FK → `users` | Dono do registro (escopo tenant via join em `users`) |
| `name` | TEXT NOT NULL | |
| `description` | TEXT | |
| `type` | TEXT CHECK product/service | |
| `price` | DECIMAL(10,2) | |
| `currency` | TEXT DEFAULT BRL | |
| `images` | JSONB default [] | |
| `features` | JSONB default [] | |
| `category` | TEXT | Livre |
| `status` | TEXT CHECK active/inactive/draft | |
| `is_public` | BOOLEAN | |
| `duration_hours` | INTEGER | Serviço |
| `cost` | DECIMAL | |
| `sku` | TEXT | |
| `stock_quantity` / `min_stock_quantity` | INTEGER | |
| `responsible_id` | UUID FK users nullable | |
| `short_description` | TEXT | |
| `discount_price` | DECIMAL | |
| `secondary_images` | JSONB | |
| `variations` | JSONB | |
| `contract_template` | TEXT | |
| `has_contract` | BOOLEAN | |
| `is_recurring` / `recurrence_interval` | BOOLEAN / TEXT | Migração `20250930025657_*.sql` |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**Observação:** não existem colunas para `pricing_mode` nem `variation_prices` — apenas `variations` JSONB.

### 3.7 Validações atuais (backend)

- **Zod** `productSchema` / `partial()` em `productsController.ts`: nome mínimo 1 caractere; tipo enum; status enum; demais campos opcionais com defaults em create; `images`/`features`/`secondary_images`/`variations` como arrays (tipo `any`).
- **Não** há validação condicional “se serviço, exige duração” ou “se produto, exige SKU”.
- **Preço:** opcional no Zod; na UI do `ProductForm` o campo é `required`, mas o backend aceita ausência.

### 3.8 Permissões e controle de acesso

- **Criação / edição / exclusão:** `assertModulePermission` para módulo `'products'` com suporte a `ownerId` e `assigneeId` (`responsible_id`).
- **Leitura listagem / getById:** **não** chama `assertModulePermission` com ação `view` — qualquer usuário autenticado no tenant com token válido pode invocar `GET /api/products` e `GET /api/products/:id` se passar no `tenantAuthCrm` e no escopo SQL. A restrição “só quem tem módulo produtos” depende **só** do frontend (`RequireModuleView` + menu), com exceções abaixo.
- **`RequireModuleView`:** `pathToModule` em `RequireModuleView.tsx` retorna `'products'` apenas para paths que **começam com** `/products`. Paths **`/admin/products`** **não** mapeiam para módulo → com `moduleId === null`, o componente **não aplica** gate de `can_view` e renderiza filhos diretamente (linha que retorna `children` quando `!moduleId`).
- **Feature flag:** `useFeatureFlag('products')` controla visibilidade do item de menu, não o acesso direto à URL.
- **Listagem pública:** `getPublicProducts` filtra `status = 'active' AND is_public = true` por `user_id` — **sem** autenticação.

### 3.9 RLS Supabase (legado)

Migração `supabase/migrations/20250922142029_*.sql` define RLS em `products` para Supabase/auth. O backend atual usa **Postgres via `pool`**; a efetividade do RLS depende de se o ambiente de produção ainda roteia leituras pelo cliente Supabase ou só pelo backend. Tratar como **possível camada duplicada / divergente** em relação ao Express.

---

## 4. Regras de negócio atuais (observadas)

### 4.1 Obrigatoriedades

- **Banco:** `name`, `type`, `currency` (default), `status` (default active), `is_public` (default true).
- **UI formulário:** nome + preço (required em input); create no client força `active`.
- **Backend:** preço opcional no Zod.

### 4.2 Diferenciação produto vs serviço

- discriminador **`type`**; UI oculta/mostra blocos; mesma tabela e mesmos endpoints.
- Campos específicos de serviço (`duration_hours`, contrato, recorrência) podem ficar nulos em produtos sem violar schema.

### 4.3 Vínculos com outros módulos

- **Carrinho / pedidos:** `product_id` FK; pedidos validam que IDs pertencem ao tenant (`ordersController.ts`).
- **Faturas de cliente:** uso via catálogo em `CustomerInvoiceNew` (descrição/preço nas linhas, não necessariamente FK persistente de linha — detalhes na própria página de fatura).
- **Dashboard:** contagem agregada por tenant.
- **Busca:** resultados misturados com outros módulos.
- **Remoção de usuário:** limpa `responsible_id` em produtos.

### 4.4 Dependências e efeitos colaterais

- **DELETE físico** de produto: `ON DELETE CASCADE` em `cart_items`; `order_items` com **RESTRICT** — pedidos históricos impedem exclusão se houver referência (comportamento típico de FK).
- **Loja pública:** depende de `store_profiles` + `getPublicProducts(userId)` + consistência de `user_id` do dono da loja.

---

## 5. Problemas encontrados (fatos + impacto)

### 5.1 Inconsistências frontend / backend

1. **`pricing_mode` e `variation_prices`:** presentes em `src/types/products.ts` e na UI de `ProductForm.tsx`, **ausentes** de `productSchema` no backend — em `create`/`update`, o Zod **remove** chaves desconhecidas; esses dados **não persistem**.
2. **Status na criação:** UI não expõe `draft`/`inactive` na criação; `productsService.createProduct` envia sempre `status: 'active'`.
3. **Preço obrigatório na UI / opcional na API:** permite divergência se outro client chamar a API sem preço.
4. **`responsible_id`:** usado nas permissões `assigneeId` no backend, mas **não há campo** no `ProductForm` para definir responsável — edição “own” pode bloquear usuários que deveriam ser assignees sem forma de atribuir via UI.
5. **Rotas `/products` vs `/admin/products`:** menu aponta para `/products`; ações internas navegam para `/admin/products/...`. **`RequireModuleView`** não cobre `/admin/products` — bypass de `can_view` para essas URLs.
6. **Busca global:** rota sugerida `/products` enquanto fluxo novo usa `/admin/products` — link pode confundir ou cair em rota legada.

### 5.2 Campos ambíguos ou faltantes

- **Categoria:** texto solto; sem normalização.
- **Descrição na lista:** usa `description` longa em cards; `short_description` cadastrado não é priorizado na listagem.
- **Imagens:** upload não implementado (TODO na UI de textura/variações); `images` tende a ficar `[]`.

### 5.3 Duplicidade de lógica

- Dois formulários conceituais (`ProductForm` vs `ProductFormDialog`) com subsets diferentes de campos; apenas o primeiro está nas rotas.
- Validação de negócio espalhada entre UI e Zod parcial.

### 5.4 Riscos de quebra / segurança / privacidade

1. **`PublicProduct.tsx` chama `productsService.getProductById(productId)`** — endpoint autenticado `GET /api/products/:id`. Visitante **sem** token recebe erro; visitante **com** sessão de outro tenant obtém 404 ou vazamento inconsistente. A página pública **não** usa `getPublicProducts` + filtro local nem endpoint público por id.
2. **`getPublicProducts`:** `SELECT *` — expõe **todos** os campos da linha (ex.: `cost`, `contract_template`, `sku`, `responsible_id`) para qualquer cliente que chame a API pública com `userId` da loja. **Risco de exposição de dados internos em produção.**
3. **`addToCart`:** após inserir item, busca produto por `id` **sem** checagem de tenant na query do produto (`cartController.ts`) — vetor a auditar em cenários multi-loja / IDs adivinhados (depende de quem pode chamar a rota).
4. **Permissão de leitura:** GET lista/detalhe sem `assertModulePermission(..., 'view')` — utilizador sem `can_view` no módulo pode ainda chamar API diretamente.

### 5.5 Usabilidade

- Sem paginação/filtros na lista para tenants com muitos itens.
- Status “draft”/“inactive” pouco utilizável sem controles na UI.
- Botões de imagem sem funcionalidade completa geram expectativa quebrada.

### 5.6 Performance

- Listagem única `getProducts` carrega todos os registros do tenant; JSONB grandes (`variations`, `images`) multiplicam payload.
- Índices existem em `user_id`, `status`, `category`, `sku`, `responsible_id` — adequados para filtros simples futuros, mas hoje pouco explorados nas queries.

### 5.7 Auditoria / log

- **Não** há tabela de auditoria específica de alterações em `products` nos arquivos mapeados; apenas logs `console.error`/`console.warn` em erros e permission engine.

### 5.8 Escalabilidade

- Catálogo como JSONB flexível escala para MVP; falta normalização se houver necessidade de relatórios por variação, estoque por SKU ou integrações externas estritas.

---

## 6. Integração com chat

### 6.1 O que existe hoje

- **`src/pages/Chat.tsx`:** não importa `productsService` diretamente; integração indireta via **`CustomerInvoiceNew`** (linhas de fatura com seleção de produto usando `productsService.getProducts()`).
- **APIs reutilizáveis pelo chat (mesmas do painel):**
  - `GET /api/products`, `GET /api/products/:id`, `POST`/`PATCH`/`DELETE` com auth tenant.
  - `GET /api/search?q=&types=products` — busca por nome/descrição, escopo tenant.
- **Não** há endpoint tipo `/api/chat/catalog` ou tool dedicada no backend para assistentes.

### 6.2 O que o chat “consegue consumir” hoje

- **Com o usuário já autenticado no painel (token):** o mesmo client poderia chamar `GET /api/products` ou `/api/search` — retornam nomes, descrições, preços (conforme colunas), tipo, status, etc.
- **Dentro do fluxo de fatura embutida:** lista de produtos do tenant para preencher linhas — já é consumo funcional limitado ao módulo de faturas, não ao núcleo de mensagens.

### 6.3 Lacunas para objetivos típicos de chat

| Objetivo | Situação |
|----------|-----------|
| **a) Consulta por nome/categoria** | Busca global cobre nome/descrição, **não** categoria no `WHERE` atual. Não há endpoint de catálogo com filtros explícitos. |
| **b) Preço / descrição / status** | Disponíveis nos JSON de `GET /api/products` **se** o consumidor tiver auth e permissão de facto; resposta pública da loja expõe demais campos (ver risco acima). |
| **c) Criação assistida / pré-cadastro** | `POST /api/products` existe e exige `can_create` + corpo Zod; não há fluxo de “rascunho via chat”, webhook ou idempotência; **não** há API pública de criação (adequado). Para assistente interno, faltam: contrato de payload estável, validações alinhadas à UI, e opcionalmente `draft` sem forçar `active` no client. |

---

## 7. Recomendações iniciais

Legenda: **(F)** fato já descrito acima; **(S)** sugestão derivada do código.

### 7.1 Melhorias rápidas de baixo risco (S)

- Incluir **`/admin/products`** (e subpaths) em `pathToModule` em `RequireModuleView.tsx` para alinhar gate ao menu e URLs reais.
- Ajustar **`searchController`** rota de produtos para o path canônico usado no app (`/admin/products` ou manter `/products` mas documentar redirect).
- Documentar para time que **`ProductFormDialog`** não está referenciado nas rotas — remover ou integrar para evitar drift.

### 7.2 Melhorias estruturais (S)

- **Endpoint público seguro para detalhe de produto** (ex.: `GET /api/products/public/:userId/:productId` com projeção explícita de colunas) e alterar `PublicProduct.tsx` para não usar `getProductById` autenticado.
- **Reduzir payload de `getPublicProducts`:** `SELECT` apenas colunas necessárias à vitrine.
- **Alinhar persistência:** ou adicionar `pricing_mode` / `variation_prices` ao schema DB + Zod, ou remover da UI/types para não induzir erro.
- **Unificar obrigatoriedade de preço** entre Zod e UI.
- **Campos de status** na UI + parar de forçar `active` no `createProduct` do client se `draft` for regra de negócio.

### 7.3 Itens que precisam migration (S)

- Novas colunas se for persistir `pricing_mode` / `variation_prices` (ou normalizar variações/preços em tabelas relacionadas).
- Tabela de **categorias** (opcional) se o negócio exigir consistência e filtros.

### 7.4 Abordagem aditiva (compatibilidade) (S)

- Novos endpoints públicos **ao lado** dos atuais, mantendo os legados com deprecação em documentação.
- Extensão do `productSchema` com campos opcionais novos (não remover campos existentes).
- `assertModulePermission` para **`view`** em GET (atrás de flag de rollout ou com checagem gradual) para não quebrar integrações que dependam silenciosamente do buraco atual.

### 7.5 Impacto em produção — resumo (F)

- Exposição excessiva em **`GET /api/products/public/:userId`**.
- Página **`PublicProduct`** dependente de API autenticada.
- **DELETE** de produto pode falhar por **RESTRICT** em pedidos — UX de “excluir” pode precisar de inativação soft.
- **GET produtos sem checagem formal de `can_view`** no backend.

---

## Referências rápidas de código

- Controller: `packages/backend/src/controllers/productsController.ts`
- Rotas: `packages/backend/src/routes/productsRoutes.ts`
- Schema SQL: `database/init/06_create_products.sql`
- Formulário: `src/pages/ProductForm.tsx`
- Lista: `src/pages/Products.tsx`
- Client HTTP: `src/services/products.ts`
- Busca: `packages/backend/src/controllers/searchController.ts`
- Chat + fatura: `src/pages/Chat.tsx`, `src/pages/CustomerInvoiceNew.tsx`

---

*Documento gerado para apoio a decisão técnica; revisar após qualquer refactor das rotas `/admin/*` ou do permissionamento de módulos.*
