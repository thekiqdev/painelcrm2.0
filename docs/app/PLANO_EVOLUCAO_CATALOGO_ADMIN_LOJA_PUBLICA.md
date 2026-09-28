# Plano de evolução — catálogo, admin da loja e vitrine pública (pós V2-1)

**Tipo:** planejamento técnico — **sem implementação**, **sem alteração de código**, **sem migrations** neste artefato.  
**Base obrigatória:** `docs/app/PLANO_EVOLUCAO_MODULO_CATALOGO.md`, `docs/app/EXECUCAO_V2_1_SEGURANCA_PUBLICA_E_PERMISSOES.md`, e **estado atual do repositório** (revisão em código).  
**Convenção:** trechos marcados como **(Fato)** derivam do código ou schema observados; **(Proposta)** são recomendações para decisão do time.

**Pré-requisito assumido:** a fase **V2-1** (DTO público allowlistado, `GET /api/products/public/store/:slug/product/:productId`, permissão `view` nos GET internos, gate `/admin/products`) está concluída ou tratada como baseline — este plano parte desse patamar para o **próximo bloco** de produto (admin + loja + mídia + checkout).

---

# 1. Resumo do objetivo

## O que esse novo bloco precisa resolver **(Proposta + alinhamento ao produto)**

Entregar, de forma **incremental e segura**:

- **Admin:** listagem de catálogo em **tabela/lista** (não cards), com filtros e ações mínimas.
- **Admin:** **página única** de configuração da loja (substituindo o fluxo em dialog).
- **Mídia:** upload real de imagens (produto e, na sequência, identidade da loja).
- **Loja pública:** evoluir vitrine e **página de produto** (hoje já existem rotas; falta riqueza visual, carrinho/checkout anônimo, tema).
- **Checkout online:** jornada pública de revisão e confirmação alinhada a carrinho/pedido existentes no backend.
- **Categorias e temas:** base para taxonomia e **templates** integráveis (ex.: layouts gerados na Lovable) sem acoplamento rígido.

## Por que isso deve vir depois da V2-1 **(Fato + Proposta)**

- **(Fato)** V2-1 estabelece **contrato público mínimo seguro** e **detalhe público sem autenticação**; construir vitrine, links profundos, checkout e integrações externas em cima de payload inseguro seria retrabalho e risco.
- **(Proposta)** Com DTO público estável, as próximas entregas podem focar em **UX, mídia e fluxo de compra** sem reabrir vazamento de dados administrativos.

## Como isso se conecta com fases futuras **(Proposta)**

- O plano macro em `PLANO_EVOLUCAO_MODULO_CATALOGO.md` (V2-2 FE/BE, V2-3 faturas, V2-4 chat, host premium, etc.) continua válido: este documento **aprofunda o “miolo”** admin + vitrine + checkout que aquele plano lista como V2-5–V2-8, **reordenado** conforme necessidades confirmadas agora (tabela admin, página da loja, mídia, tema, checkout).
- **Host canônico / subdomínio / DNS do cliente** permanecem **fora** do escopo imediato deste bloco, salvo preparação de **URLs relativas** e contratos que não quebrem quando o host mudar.

---

# 2. Estado atual relevante

## 2.1 Listagem de produtos no admin **(Fato)**

- **UI:** `src/pages/Products.tsx` renderiza produtos em **grid de cards** (`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3`), com badges de tipo/status, preço, categoria e botões Editar/Excluir.
- **Dados:** `productsService.getProducts()` → `GET /api/products` (`packages/backend/src/routes/productsRoutes.ts`, após `tenantAuthCrm`).
- **Backend:** `getProducts` em `packages/backend/src/controllers/productsController.ts` — `SELECT p.*`, `ORDER BY p.created_at DESC`, **sem paginação nem filtros**; exige `assertModulePermission(..., 'view', ...)` (pós V2-1).
- **Limitação:** carrega **lista completa** do tenant; não há busca server-side nem colunas densas (SKU, estoque) em tabela.

## 2.2 Configuração da loja **(Fato)**

- **UI:** botão “Configurar Loja” abre **`StoreConfigDialog`** (`src/components/products/StoreConfigDialog.tsx`): dialog `max-w-md` com nome, slug, descrição, telefone, WhatsApp, e-mail, flag `is_active`.
- **Resumo na listagem:** `Products.tsx` também mostra um **Card** “Sua Loja Virtual” com link `/{store_slug}/loja`.
- **API:** `GET|POST|PATCH /api/store-profile` (`packages/backend/src/routes/storeProfileRoutes.ts`, protegidas por `tenantAuthCrm`); público: `GET /api/store-profile/public/slug/:slug` e `.../public/:userId`.
- **Backend:** `storeProfileController.ts` — Zod inclui `store_logo` opcional no schema de create/update.
- **Gap:** o **dialog não expõe `store_logo`** no formulário (apenas campos listados acima), embora o tipo `StoreProfile` em `src/types/products.ts` já tenha `store_logo?: string`.

## 2.3 Suporte a imagens **(Fato)**

- **Modelo:** `products.images` e `products.secondary_images` como **JSONB** (`database/init/06_create_products.sql`); `store_profiles.store_logo` **TEXT** (URL ou path — sem semântica fixa no código).
- **DTO público V2-1:** inclui `images` e `secondary_images` (`PUBLIC_PRODUCT_SELECT` + `toPublicProductDto` em `productsController.ts`).
- **Admin — `ProductForm.tsx`:** seção “Imagens” com **UI de drag-and-drop e botões “Escolher Arquivos” / “Adicionar Imagens” sem `input type="file"` funcional nem chamada de API** — ou seja, **placeholder**; comentário explícito de TODO para upload de textura em variações (~L826).
- **Backend:** busca por **multer/S3/presign** em `packages/backend/src` não aparece como pipeline de upload de produtos (nenhum módulo óbvio de storage de arquivos para catálogo).

## 2.4 Loja pública **(Fato)**

- **Rotas SPA:** `src/App.tsx` — `/:storeSlug/loja` → `PublicStore`; `/:storeSlug/loja/produto/:productId` → `PublicProduct`.
- **Dados:** `PublicStore.tsx` — `getPublicStoreBySlug` + `getPublicProducts(store.user_id)`; vitrine em **grid de cards** com texto, preço, features (parcial), CTA **“Solicitar Orçamento”** via WhatsApp quando há `contact_whatsapp`.
- **Visual:** layout único (shadcn/card), **sem** uso de `store_logo` no header de `PublicStore.tsx` (apenas título e descrição textuais).
- **Categorias na vitrine:** exibidas como **badge** por produto usando `product.category` (string vinda do DTO).

## 2.5 Página pública de produto **(Fato)**

- **`PublicProduct.tsx`:** resolve loja por slug e produto por `getPublicProductByStoreSlugAndProductId` (API pública V2-1); layout em duas colunas (informações + card de orçamento); CTA principal **WhatsApp**; tratamento de404.
- **Imagens:** **não há** `<img>` nem galeria — os campos `images` / `secondary_images` do DTO **não são renderizados** na UI atual.
- **Preço:** exibe `product.price`; **não** exibe `discount_price` na UI observada (apesar de existir no tipo `PublicCatalogProduct`).

## 2.6 Checkout da loja **(Fato)**

- **Rota `/checkout` no `App.tsx`:** associada a **`PlanCheckout`** (checkout do **plano/SaaS**), **não** da loja do catálogo — **não misturar** com vitrine (alinhado ao plano V2 que já alerta sobre `checkout-context` SaaS vs loja).
- **Carrinho (catálogo):** rotas `packages/backend/src/routes/cartRoutes.ts` aplicam **`router.use(...tenantAuthCrm)` em todas as rotas** — ou seja, **carrinho exige autenticação CRM**, incompatível com visitante anônimo na vitrine.
- **Cliente front:** `src/services/cart.ts` chama `/api/cart/...` e `POST /api/orders`; componente `src/components/products/ShoppingCart.tsx` existe mas **não é importado** por nenhuma página listada no grep (carrinho de UI **órfão** em relação às rotas atuais).
- **Pedidos admin:** `src/pages/Orders.tsx` usa `cartService.getOrders()` — fluxo **autenticado** para dono da loja.
- **Conclusão (Fato):** não existe hoje **página de checkout público** da loja nem carrinho anônimo integrado à vitrine; a jornada pública é **WhatsApp / contato**, não carrinho.

## 2.7 Categorias **(Fato)**

- **Schema:** `products.category TEXT` livre (`06_create_products.sql`); sem tabela `categories` nem `category_id`.
- **Admin:** `ProductForm.tsx` — input de categoria como texto livre (“Ex: Eletrônicos…”).
- **Público:** filtro por categoria **não** existe na vitrine; apenas exibição por produto.

## 2.8 Visual / tema da loja **(Fato)**

- **Theming:** vitrine usa **tokens globais** da app (`bg-background`, `bg-card`, componentes shadcn) — **sem** campo de “tema” ou “template” em `store_profiles` nem feature flag de layout.
- **Lovable / templates externos:** **não há** ponto de extensão no código (registry de tema, lazy load de bundle, etc.) — integração seria **nova capacidade**.

---

# 3. Proposta de divisão em fases

A divisão abaixo **respeita** o esqueleto pedido (Fase 1–3), mas **ajusta** com base nos **fatos** do código: página de produto e rota pública **já existem**; o trabalho é **evolução** (mídia, preço promocional, CTA compra) e **não** greenfield.

## Fase 1 — Admin do catálogo e “página da loja” **(Proposta)**

- Listagem admin em **tabela** com colunas mínimas, ordenação básica, filtros (status, tipo, busca por nome, opcional categoria texto).
- Ações por linha: editar, excluir (como hoje), opcional “abrir vitrine”.
- **Página dedicada** `/admin/store` ou `/admin/loja` (nome a definir) para configuração da loja — conteúdo hoje concentrado em `StoreConfigDialog` + card em `Products.tsx`.
- **Categorias — base:** normalização leve **(Proposta)** — lista de categorias sugeridas por tenant (pode começar como JSON/array em perfil ou tabela nova na **mesma** fase só se migration for aprovada); alternativa de menor risco: **autocomplete** a partir de valores distintos já usados nos produtos (sem migration).

## Fase 2 — Mídia, identidade visual e temas **(Proposta)**

- **Upload real:** pipeline backend (presign ou multipart) + persistência de **URLs públicas** em `images` / `secondary_images` / `store_logo`; validação de tipo/tamanho.
- **Logo e banner:** **(Fato)** `store_logo` já existe no DB; **banner** não existe — **(Proposta)** adicionar coluna ou campo JSON de “hero” em `store_profiles` em sprint de mídia (quando migrations forem permitidas).
- **Galeria** na página pública de produto e thumbs na listagem.
- **Arquitetura de temas:** config em `store_profiles` (ex.: `theme_id` + `theme_config` JSON) e **renderização por tema** no front público (ver §4.5); entrega inicial pode ser **um** tema interno + contrato para importar layout Lovable como **pacote estático** ou **iframe** (decisão em §4.5).

## Fase 3 — Loja pública completa e checkout **(Proposta)**

- **Carrinho anônimo:** alteração **necessária** no backend — hoje `cartRoutes` é100% autenticado **(Fato)**; opções: rotas públicas com `session_id` (já há coluna em `shopping_carts`) + CSRF/rate limit, ou BFF público.
- **Página de checkout:** revisão de itens, dados do comprador, criação de pedido (`POST /api/orders`) — alinhar com plano V2 sobre idempotência e estados (`orders.payment_status`, etc.).
- **Pagamento:** fora do escopo mínimo deste documento, mas **dependência** explícita se “checkout online” incluir PIX/cartão — ver §4.7.
- **Categorias públicas:** navegação por categoria e/ou URL com query **após** Fase 1 definir modelo.
- **Tema aplicado:** vitrine e checkout usando o tema selecionado na Fase 2.

**Nota (Fato):** “página de produto único” **já** está na rota `/:storeSlug/loja/produto/:productId`; na Fase 3 o foco é **paridade de produto** (imagens, desconto, adicionar ao carrinho) e **encadeamento** até checkout.

---

# 4. Plano técnico por tema

## 4.1 Listagem admin em tabela

| Aspecto | Conteúdo |
|--------|-----------|
| **Estado atual (Fato)** | `Products.tsx` — cards; `getProducts` sem paginação. |
| **Limitações (Fato)** | Performance com muitos SKUs; pouca densidade de informação; sem filtros. |
| **Proposta de UX (Proposta)** | Tabela com colunas: nome, tipo, status, preço, categoria (texto), público (sim/não), ações. Opcional: thumbnail quando mídia existir. |
| **Filtros mínimos (Proposta)** | Busca por nome; filtro status; filtro tipo; (opcional) categoria. |
| **Ações mínimas (Proposta)** | Editar, excluir, link “ver na loja” se `is_public` + `active`. |
| **Impacto técnico (Proposta)** | Front: novo layout em `Products.tsx` ou extrair `ProductsTable.tsx`; componentes shadcn `Table`. Back: idealmente `limit/offset` + `search` em `getProducts` (mudança de contrato API — **versionar ou adicionar query params opcionais** para compat). |

## 4.2 Página única de configuração da loja

| Aspecto | Conteúdo |
|--------|-----------|
| **Estado atual (Fato)** | `StoreConfigDialog.tsx` + trecho em `Products.tsx`. |
| **Limitações do popup (Proposta)** | Pouco espaço para logo, banner, preview, temas e categorias da loja; UX fragmentada. |
| **Proposta de rota (Proposta)** | Ex.: `/admin/loja` ou `/admin/store-settings`, protegida pelo mesmo módulo `products` (ou módulo futuro `store` — **decisão de produto**). |
| **Blocos da página (Proposta)** | Identidade (nome, slug, descrição); contatos; status ativo; **mídia** (logo, banner na Fase 2); **aparência** (tema); **categorias da loja** (se Fase 1 entregar taxonomia); preview do link público. |
| **Impacto técnico (Proposta)** | Reutilizar lógica de submit do dialog em página; `App.tsx` nova rota; possível mover card resumo de `Products.tsx` para link “Gerenciar loja”. |

## 4.3 Upload de imagens

| Aspecto | Conteúdo |
|--------|-----------|
| **Estado atual (Fato)** | Campos JSONB + `store_logo`; UI de produto sem upload funcional; sem serviço de arquivo dedicado no backend aparente. |
| **O que falta (Proposta)** | Storage (S3/R2/Azure), política de ACL pública para vitrine, endpoint `POST` ou URL assinada PUT, persistência da URL no registro. |
| **Fluxo sugerido (Proposta)** | Cliente pede permissão → upload direto ao bucket (preferível) ou via backend → retorna URL final → PATCH produto/perfil. |
| **Imagem principal (Proposta)** | Convenção: `images[0]` como principal (já sugerido no texto de `ProductForm.tsx`). |
| **Galeria (Proposta)** | `secondary_images` ou apenas `images` ordenado — alinhar um único modelo para evitar duplicação conceitual. |
| **Validação (Proposta)** | MIME, tamanho máx, dimensão máx; opcional geração de thumb (job ou on-upload). |
| **Storage (Proposta)** | Bucket por ambiente; prefixo por `tenant_id` ou `user_id` dono da loja; URLs estáveis para não quebrar vitrine. |
| **Impacto técnico (Proposta)** | Novo módulo backend (ex.: `uploadController`, config env), mudanças em `ProductForm.tsx`, `StoreConfig`/página loja; custo operacional e compliance (LGPD menor para imagens de produto, mas política de conteúdo). |

## 4.4 Categorias

| Aspecto | Conteúdo |
|--------|-----------|
| **Estado atual (Fato)** | `category TEXT` por produto; sem entidade separada. |
| **String melhorada vs estrutura (Proposta)** | **Curto prazo (sem migration):** autocomplete a partir de `SELECT DISTINCT category` no tenant + normalização trim/case no save. **Médio prazo:** tabela `store_categories` (id, tenant, slug, nome, ordem) + `products.category_id` FK — melhor para vitrine e SEO. |
| **Impacto admin (Proposta)** | CRUD leve de categorias na página da loja ou submenu; `ProductForm` com `Select` em vez de texto solto. |
| **Impacto vitrine (Proposta)** | Filtro lateral ou tabs; URLs `?categoria=` ou `/{slug}/loja/categoria/:slug` — última exige rotas novas no `App.tsx`. |

## 4.5 Temas / templates

| Aspecto | Conteúdo |
|--------|-----------|
| **Preparar arquitetura (Proposta)** | Separar **dados** (produtos, perfil loja, URLs de mídia) de **apresentação**: contrato `StoreThemeContext` no front público com `{ themeId, tokens, layoutComponent }`. |
| **Cadastro / seleção (Proposta)** | Campo em `store_profiles` (ex.: `theme_key TEXT`, `theme_options JSONB`) editado na página da loja; lista de temas **registrados no build** da app (mapa `themes/default`, `themes/lovable-x`) para evitar carregar código arbitrário sem revisão. |
| **Conteúdo vs apresentação (Proposta)** | Lovable gera **layout** (HTML/CSS/React); o sistema hospeda **dados via API** já existentes (`PublicCatalogProduct`, store profile). Integração: tema consome apenas DTOs públicos + `store_profile` público. |
| **Lovable sem acoplamento ruim (Proposta)** | Importar tema como **pacote** ou pasta versionada (`src/themes/<name>/`) com interface comum `PublicLayoutProps`; evitar iframes com auth cruzada; evitar `eval` de código remoto; **code review** obrigatório ao subir novo tema. |

## 4.6 Página de produto único

| Aspecto | Conteúdo |
|--------|-----------|
| **Estado atual (Fato)** | Rota `/:storeSlug/loja/produto/:productId`; dados via API pública segura; sem imagens na UI; CTA WhatsApp. |
| **Proposta de rota (Proposta)** | **Manter** rota atual para compatibilidade; opcional alias futuro canônico documentado no plano V2 (path legado). |
| **Dados mínimos (Fato + Proposta)** | Já cobertos pelo DTO V2-1; **(Proposta)** exibir `discount_price` quando menor que `price`; `short_description` no hero. |
| **Imagens (Proposta)** | Hero + galeria lightbox após Fase 2 de mídia. |
| **CTA de compra (Proposta)** | Além de WhatsApp: “Adicionar ao carrinho” quando carrinho anônimo existir; serviços podem manter CTA contato. |
| **Impacto técnico (Proposta)** | `PublicProduct.tsx` + possível split `ProductGallery.tsx`; dependência forte da Fase 2 (URLs reais). |

## 4.7 Checkout online

| Aspecto | Conteúdo |
|--------|-----------|
| **Estado atual (Fato)** | `POST /api/orders` + tabelas `orders` / `order_items`; carrinho em `shopping_carts` / `cart_items`; **cart** só com `tenantAuthCrm`. |
| **Carrinho / pedido existente (Fato)** | `cartService` e `ordersController` implementam núcleo; UI de carrinho em componente não plugado na vitrine. |
| **O que falta para checkout real (Proposta)** | Rotas públicas de carrinho (session), página `/loja/checkout` ou `/:storeSlug/loja/checkout`, formulário cliente, revisão, chamada `createOrder`, tratamento de erro (preço alterado, produto indisponível). |
| **Dependências (Proposta)** | Decisão de **preço snapshot** no item do pedido (já parcial no backend — validar `ordersController`); **idempotência** (header) se retry; opcional autenticação opcional do comprador. |
| **Riscos (Proposta)** | Segurança: rate limit em público; validação server-side de `product_id` e preço; fraude/abuse em `POST /orders`; **pagamento** aumenta risco operacional (ver plano V2-8). |

---

# 5. Dependências e ordem recomendada

| Tema | Pode entrar já? | Depende de quê? | Risco | Fase recomendada |
|------|-----------------|-----------------|-------|------------------|
| Lista admin (tabela) | Sim | Nada crítico; paginação opcional melhora escala | Baixo | **1** |
| Página da loja | Sim | Decisão de rota + permissão módulo | Baixo | **1** |
| Upload de imagens | Parcial | Storage, env, política de URL; convém após página loja para logo | Médio | **2** |
| Categorias | Parcial | Fase 1 pode ser só texto melhorado; vitrine por categoria depende de modelo | Médio | **1** (leve) / **3** (navegação) |
| Logo / banner | Logo: sim após upload; banner: migration | Upload + campo novo para banner | Médio | **2** |
| Temas / templates | Parcial | Contrato de dados público estável (**V2-1 ok**) | Médio | **2** (base) / **3** (polimento) |
| Produto único (evolução) | Sim | Mídia para valor visual; carrinho para CTA compra | Baixo–Médio | **2–3** |
| Checkout online | Não sem mudança backend | Carrinho público + UX; alinhamento pedido/pagamento | Alto | **3** |

---

# 6. Arquivos impactados (expectativa para implementação futura)

## Frontend **(Proposta)**

- `src/pages/Products.tsx`, possivelmente novo `src/components/products/ProductsTable.tsx`.
- `src/components/products/StoreConfigDialog.tsx` (reduzir ou deprecar), nova `src/pages/StoreSettings.tsx` (nome ilustrativo).
- `src/pages/ProductForm.tsx` (upload, galeria).
- `src/pages/PublicStore.tsx`, `src/pages/PublicProduct.tsx` (imagens, tema, filtros, CTA carrinho).
- `src/App.tsx` (rotas admin loja, checkout público, opcional categoria).
- `src/services/products.ts`, `src/services/cart.ts` (contratos públicos).
- `src/types/products.ts` (tipos de tema, banner, categoria estruturada se houver).

## Backend **(Proposta)**

- `packages/backend/src/controllers/productsController.ts` (query params paginação/filtros).
- `packages/backend/src/controllers/storeProfileController.ts` (novos campos tema/banner quando existirem migrations).
- `packages/backend/src/routes/cartRoutes.ts` / `cartController.ts` (rotas públicas + session).
- `packages/backend/src/controllers/ordersController.ts` (validações checkout, idempotência — alinhado plano V2).
- Novo: módulo de upload/presign (caminho a definir).

## Banco / modelagem **(Proposta — quando migrations forem permitidas)**

- `store_profiles`: `theme_key`, `theme_config JSONB`, opcional `banner_url` ou JSON de hero.
- Opcional: `store_categories` + FK em `products`.
- Revisão de índices para `products(user_id)`, `products(category)`, busca texto.

## Integrações futuras **(Proposta)**

- Provedor de objeto (S3-compatível), CDN.
- Gateway de pagamento (checkout completo).
- Importação de pacotes de tema gerados em Lovable (pipeline de build/CI).

---

# 7. Riscos e compatibilidade

| Tópico | Detalhe |
|--------|---------|
| **O que pode quebrar (Proposta)** | Mudança de `GET /api/products` com paginação pode afetar clientes que assumem lista completa; rollout com params opcionais. Carrinho público exige hardening (abuso, estoque). |
| **Aditivo (Proposta)** | Novas rotas (`/api/cart/public/...`), novas colunas nullable em `store_profiles`, novas páginas SPA — preservar rotas `/:storeSlug/loja` existentes. |
| **Não refatorar agora (Proposta)** | Modelo completo de variações/preço por variação (gap FE/BE do plano V2-2); domínio premium multi-host; chat picker. |
| **Produção (Proposta)** | Feature flags por tenant para “checkout beta” e “tema v2”; monitorar 4xx/5xx em endpoints públicos novos; manter DTO público enxuto. |

---

# 8. Recomendação final

## Melhor ordem de implantação **(Proposta)**

1. **Fase 1:** tabela no admin + página única da loja (baixo risco, alto ganho de UX operacional).  
2. **Fase 2:** upload + logo + galeria na vitrine + **esqueleto de tema** (sem exigir Lovable no primeiro PR).  
3. **Fase 3:** carrinho anônimo + página de checkout + pedido; pagamento em wave separada se necessário.

## O que deve entrar primeiro **(Proposta)**

- Tabela admin e página da loja — desbloqueiam organização de conteúdo antes de investir em mídia pesada.

## O que não deve ser misturado na mesma sprint **(Proposta)**

- **Checkout/pagamento** junto com **primeiro upload** — risco e superfície de teste grandes demais.  
- **Migration de categorias** junto com **refactor total de variações** — conflito de QA e rollout.

## Próxima fase ideal após este plano **(Proposta)**

- Executar **Fase 1** como “V2 próximo incremento” e, em paralelo de especificação, fechar **fornecedor de storage** e desenho de **session pública do carrinho** (pré-requisito técnico da Fase 3).  
- Reconectar com o plano macro: **V2-2** (alinhamento Zod/UI) pode ser paralelo à Fase 1 se equipe separar fronteiras de PR; evitar conflito nos mesmos arquivos (`ProductForm.tsx`).

---

*Documento gerado para planejamento pós V2-1. Atualizar após decisões de migration, storage e escopo exato de pagamento na vitrine.*
