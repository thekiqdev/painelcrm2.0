# Plano técnico de evolução — módulo de catálogo (produtos e serviços) **— V2**

**Versão:** 2.1 (refino do escopo de host: path legado → subdomínio da plataforma → subdomínio no domínio do cliente; apex/raiz como fase posterior; onboarding DNS mínimo no premium).  
**Tipo:** plano de implantação futura — **sem implementação**, **sem alteração de código**, **sem migrations** neste artefato.  
**Base:** código atual do repositório e diagnóstico em `docs/contexto/DIAGNOSTICO_MODULO_PRODUTOS_SERVICOS.md`.  
**Convenção:** trechos marcados como **(Fato)** derivam do código observado; trechos marcados como **(Proposta)** são recomendações para decisão do time.

### Changelog V2 **(Proposta editorial)**

- Inclusão de estratégia de **host/URL canônica** (path legado, subdomínio da plataforma, subdomínio no domínio do cliente; apex fora do premium inicial) e **página principal do tenant**.
- Detalhamento de **checkout vs pagamento** e **idempotência**, alinhado ao que existe em `orders`/`cart`.
- Seções dedicadas a **estoque/reserva/concorrência**, **mídia/galeria/OG**, **matriz de permissões por canal**, **observabilidade/rollback**.
- **Repriorização** das fases com confronto explícito com uma ordem alternativa sugerida pelo negócio.
- **Tabela final de decisão** (entrar no plano vs implementar já vs fase).

---

# 1. Resumo executivo

## O que existe hoje **(Fato)**

- Uma única entidade **`products`** com `type IN ('product','service')`, dono `user_id`, escopo multi-tenant via join em `users` (`packages/backend/src/controllers/productsController.ts`, `database/init/06_create_products.sql`).
- **Admin/catálogo interno:** CRUD via `GET|POST|PATCH|DELETE /api/products` (`packages/backend/src/routes/productsRoutes.ts`), UI em `src/pages/Products.tsx`, `src/pages/ProductForm.tsx`, cliente `src/services/products.ts`.
- **Loja pública / vitrine:** `store_profiles` + `GET /api/products/public/:userId` + `GET /api/store-profile/public/slug/:slug` (`storeProfileRoutes.ts`); páginas `src/pages/PublicStore.tsx`, `src/pages/PublicProduct.tsx`; rotas SPA em `src/App.tsx` no padrão `/{storeSlug}/loja` e detalhe de produto (parâmetros atuais da aplicação).
- **Carrinho e pedido:** `/api/cart/*` (`cartRoutes.ts`, `cartController.ts`), `/api/orders` (`ordersRoutes.ts`, `ordersController.ts`); front `src/services/cart.ts` com `createOrder` → `POST /api/orders`.
- **Fatura (cliente):** itens aceitam `product_id` opcional no backend (`customerInvoicesController.ts` — `createItemSchema`); UI `src/pages/CustomerInvoiceNew.tsx` carrega catálogo com `productsService.getProducts()` e envia `product_id` nas linhas quando aplicável.
- **Chat:** não há API de catálogo dedicada; uso **indireto** via embed de `CustomerInvoiceNew` em `src/pages/Chat.tsx`.
- **Busca CRM:** produtos em `GET /api/search` (`searchController.ts`), limite curto, rota de retorno `/products`.
- **Checkout context (SaaS):** `packages/backend/src/index.ts` expõe rota de contexto de checkout do **tenant/plano** (`/api/me/tenant/checkout-context` via `checkoutContextController`) — **distinto** do checkout da **loja pública** do catálogo **(Fato)**; não misturar os dois fluxos no desenho.

## O que se espera no futuro **(Proposta de produto)**

- Catálogo estruturado; mini loja pública; carrinho, **checkout** e **pagamento** onde aplicável; integração oficial com **faturas**; **chat/WhatsApp** com catálogo read-only, **deep links**, descrição + imagem + galeria.
- **Evolução de URL pública (ordem desejada):** manter e formalizar **path legado** `/{slug}/loja` **(Fato)**; depois **subdomínio da plataforma** (ex.: `{slug}.loja.plataforma.com`); **premium inicial:** **subdomínios no domínio do cliente** (ex.: `loja.cliente.com.br`, `app.cliente.com.br`) com onboarding DNS; **domínio raiz/apex** (`cliente.com.br`) **fora da primeira onda premium** — só como fase posterior mais complexa. **Escolha de página principal (app vs loja)** evolui junto do modelo multi-host **(Proposta)**.

## Principais gaps **(Fato + síntese)**

| Gap | Origem observada |
|-----|------------------|
| Contrato UI ≠ API | `pricing_mode` / `variation_prices` na UI e em `src/types/products.ts` sem `productSchema` no backend; `createProduct` no client força `status: 'active'` (`src/services/products.ts`). |
| Loja pública frágil / arriscada | `getPublicProducts` usa `SELECT *`; `PublicProduct.tsx` usa `getProductById` (rota autenticada `GET /api/products/:id`) em fluxo público. |
| Listagem admin pobre | `getProducts` sem paginação/filtros; `Products.tsx` carrega lista completa. |
| Categorias | Apenas `category TEXT` livre. |
| Imagens | Modelo JSONB (`images`, `secondary_images`); upload na UI majoritariamente placeholder (`ProductForm.tsx`). |
| Permissões | `assertModulePermission` em create/edit/delete; GET interno sem `view` formal; `RequireModuleView` não mapeia `/admin/products` (diagnóstico). |
| Chat / WhatsApp | Sem endpoints nem contrato “catálogo para conversa”; sem estratégia formal de URL canônica multi-host. |
| Checkout loja | Pedido + carrinho existem; jornada checkout/pagamento da vitrine e estados alinhados a gateway **não** estão fechados no código analisado. |

## Riscos mais sensíveis para produção **(Fato)**

1. Exposição de dados em `getPublicProducts` (`SELECT *` em `productsController.ts`).
2. Detalhe público dependente de API autenticada (`PublicProduct.tsx` + `GET /api/products/:id`).
3. Campos da UI que não persistem no servidor (Zod).
4. Leitura do catálogo via API sem alinhar a `can_view` do módulo `products`.
5. DELETE físico vs `order_items` com `ON DELETE RESTRICT` (`06_create_products.sql`).

**Diagnóstico detalhado:** `docs/contexto/DIAGNOSTICO_MODULO_PRODUTOS_SERVICOS.md`.

---

# 2. Estado atual consolidado

## 2.1 Catálogo / admin **(Fato)**

- **Tabela:** `public.products` (`database/init/06_create_products.sql`).
- **API:** `packages/backend/src/routes/productsRoutes.ts` — após `tenantAuthCrm`: listagem, detalhe, criar, patch, deletar; `productsController.ts`.
- **Validação:** Zod `productSchema` / `partial()` (sem `pricing_mode`, `variation_prices`).
- **Front:** `ProductForm.tsx`, `Products.tsx`, `src/services/products.ts`, `src/types/products.ts`.
- **Permissões módulo:** `products` em `modulePermissionsService.ts`; `assertModulePermission` nas mutações.
- **Nav:** `AppLayout.tsx` — `useFeatureFlag('products')`, link `/products`; rotas `/admin/products` em `App.tsx`.

## 2.2 Loja pública **(Fato)**

- **Perfil:** `store_profiles`; público `GET /api/store-profile/public/slug/:slug` e `.../public/:userId`.
- **Itens:** `GET /api/products/public/:userId` — `status = 'active' AND is_public = true`.
- **Páginas:** `PublicStore.tsx`, `PublicProduct.tsx`.
- **Limite:** sem endpoint público de detalhe com DTO seguro; mistura fluxo público com rota autenticada no detalhe.

## 2.3 Carrinho / checkout / pedido **(Fato)**

- **Carrinho:** `/api/cart/:storeUserId`, itens em `cartController.ts` + tabelas `shopping_carts`, `cart_items`.
- **Pedido:** `POST /api/orders` — validação de `product_id` no tenant; `orders`, `order_items` com snapshot parcial (nome/tipo/preço por item).
- **Front:** `src/services/cart.ts` — `createOrder`.

## 2.4 Fatura **(Fato)**

- `customerInvoicesController.ts` — `product_id` opcional nos itens.
- `CustomerInvoiceNew.tsx` — `getProducts()` + linhas com `product_id`.

## 2.5 Chat **(Fato)**

- Catálogo só no contexto de fatura embutida; sem picker genérico de produto.

## 2.6 Limitações que impactam evolução **(Fato)**

- Payload público; permissões; paginação; categoria; mídia; rotas `/products` vs `/admin/products`; `ProductFormDialog.tsx` fora das rotas.

---

# 3. Visão alvo do módulo **(Proposta)**

## 3.1 Catálogo interno

- Um registro por item com `type` produto | serviço; campos comuns e específicos por tipo; categorias estruturadas; mídia com URLs estáveis; metadados para canais (nome, preço exibido, imagem principal, galeria limitada, `public_url` canônica).

## 3.2 Loja pública

- Listagem paginada; detalhe com galeria; carrinho; checkout explícito; pagamento quando regra de negócio exigir; APIs públicas com DTO mínimo.

## 3.3 Chat e WhatsApp

- API read-only para canal; busca; envio de **deep link** + conteúdo rico (descrição, imagem principal, subset da galeria); sem edição de catálogo pelo canal na v1.

## 3.4 Faturas

- `product_id` opcional + **snapshot** obrigatório na emissão; imutabilidade de valores em fatura fechada.

---

# 4. Estratégia de domínio e URLs públicas por tenant **(Proposta)**

## 4.1 Três cenários de endereço (ordem de evolução desejada pelo produto)

| Ordem | Cenário | Exemplo | Papel no roadmap |
|-------|---------|---------|-------------------|
| **1** | **Path legado na plataforma** | `https://<host-app>/{slug}/loja` | **(Fato)** Já usado pelo SPA (`App.tsx`, ex.: `/{storeSlug}/loja`). **Base imediata**; sem DNS adicional para o tenant. |
| **2** | **Subdomínio da plataforma** | `https://{slug}.loja.plataforma.com` | **Próximo passo relativamente simples:** wildcard DNS + certificado na infra da plataforma; mapear `Host` → tenant/`store_slug`. |
| **3** | **Subdomínio no domínio do cliente** | `https://loja.cliente.com.br`, `https://app.cliente.com.br` | **Premium inicial (host):** o cliente aponta **CNAME** (ou equivalente) para a plataforma; TLS no hostname do cliente; pode haver host separado para loja e para app/login. |

**Linguagem do plano:** não usar **“domínio próprio do tenant”** de forma genérica. O escopo inicial desejado é explicitamente a **sequência 1 → 2 → 3**; o “próprio” no sentido comercial corresponde sobretudo ao **cenário 3** (subdomínios sob zona DNS do cliente), não ao apex.

## 4.2 Domínio raiz / apex (`cliente.com.br`) — fora do premium inicial **(Proposta)**

- Servir a loja ou o app em **`https://cliente.com.br`** (sem subdomínio) **não** é objetivo da **primeira onda** do premium de host.
- Motivo típico: apex exige **ALIAS/ANAME**, redirect ou configuração DNS mais delicada; certificados e verificação tendem a ser **mais complexos** que `loja.cliente.com.br`.
- Tratar apex apenas como **possibilidade futura / fase posterior mais complexa**, depois de subdomínios do cliente estáveis e operação DNS madura.

## 4.3 Implicações técnicas por cenário **(Proposta)**

- **Path legado:** URL canônica deriva de `origin` público da app + `/{slug}/...`; resolução por `Host` pode ser genérica (um só host da plataforma).
- **Subdomínio da plataforma:** config `hostname → tenant_id` / `store_slug`; cache com TTL; redirect 301 opcional do path legado para o subdomínio quando o tenant “graduar”.
- **Subdomínio do cliente:** entidade futura (ex.: `tenant_hosts`: hostname, papel `store|app|redirect`, status — ver §4.9); TLS por hostname; **não** exigir no núcleo inicial do catálogo.

## 4.4 Resolução de tenant pelo `Host` **(Proposta)**

1. Normalizar `Host` (lowercase, sem porta).
2. Ordem sugerida: **subdomínio no domínio do cliente com status `ativo`** → **subdomínio da plataforma** → **host padrão da plataforma** com path `/{slug}/...` (legado).
3. Se nenhum match: 404 ou redirect para landing da plataforma (decisão de produto).

**Impacto em API (Fato):** hoje `GET /api/store-profile/public/slug/:slug` e vitrine usam **slug** no path, não o `Host` — a resolução por hostname seria camada adicional (edge/BFF/SSR). O backend pode permanecer com slug/`userId` enquanto o front ou edge resolve o contexto.

## 4.5 URL canônica, redirects e página principal **(Proposta)**

- Funções conceituais `canonical_store_base(tenant)` e `canonical_product_url(tenant, product_id)` com preferência: **host do cliente `ativo`** > **subdomínio da plataforma** > **path legado** (mesmo origin).
- **Links em chat/WhatsApp** devem usar sempre a URL canônica do patamar em que o tenant estiver (evitar misturar ambientes).
- **Redirects 301** do patamar inferior para o superior quando o tenant habilitar novo host.
- **Página principal (app vs loja):** combina com **dois hosts** no cenário 3 (ex.: `app.` vs `loja.`); apex não é pré-requisito.

## 4.6 Redirects, legado e APIs **(Proposta)**

- Manter `store_slug` em `store_profiles` **(Fato)** como chave interna estável.
- Deprecar gradualmente rotas públicas acopladas a `userId` em favor de slug + DTO seguro, com convivência documentada.

## 4.7 Impacto em chat, WhatsApp e OG **(Proposta)**

- Preview (WhatsApp/OG) exige que o **mesmo hostname** da URL do link sirva HTML/meta corretos; ao introduzir host do cliente, o edge precisa rotear esse host para a vitrine.

## 4.8 Plano avançado / premium — o que entra quando **(Proposta)**

- **Cedo:** especificação e canônico no **path legado**; depois **subdomínio da plataforma** (simples na infra própria).
- **Premium inicial (host):** **subdomínio(s) no domínio do cliente** + fluxo §4.9.
- **Fase posterior:** **apex** do cliente; recursos adicionais de multi-host avançado.

## 4.9 Onboarding DNS mínimo (premium — subdomínio do cliente) **(Proposta)**

Fluxo mínimo acordado para o cenário **loja.cliente.com.br** / **app.cliente.com.br**:

1. O tenant **cadastra o hostname** desejado no painel.
2. O sistema **valida o formato** do host (FQDN permitido; política pode **rejeitar apex** enquanto apex estiver fora de escopo).
3. O sistema **informa o apontamento DNS esperado** (ex.: registro **CNAME** para um target operado pela plataforma — valor exato definido na infra).
4. O registro permanece com **status:** `pendente` → `validando` → **`ativo`** ou **`erro`** (com mensagem para correção).
5. Somente em **`ativo`** (posse/resolução DNS verificada, TLS apto a ser emitido/renovado) o hostname passa a ser usado como **URL canônica** oficial da loja ou do app para aquele tenant.

---

# 5. Arquitetura de checkout e pagamento **(Proposta)**

> **(Fato)** Hoje existem **carrinho** (`shopping_carts`/`cart_items`), **criação de pedido** (`POST /api/orders`, `orders` com `payment_status`, `payment_method`) e contexto de checkout **SaaS** separado (`checkoutContextController`). Não há neste plano implementação de gateway da vitrine.

## 5.1 Conceitos distintos

| Conceito | Papel |
|----------|--------|
| **Carrinho** | Estado temporário por `user_id` + `store_user_id` **(Fato)**; pode ser abandonado. |
| **Checkout** | Passos de revisão, dados do comprador, escolha de frete/regras (futuro), confirmação **antes** de cobrar. |
| **Pedido** | Registro persistido `orders` + `order_items` **(Fato)**; snapshot de itens. |
| **Pagamento** | Cobrança no gateway; conciliação com `payment_status` / referência externa (evolução). |

## 5.2 Fluxo esperado de compra pública **(Proposta)**

1. Visitante navega vitrine (DTO público).
2. Adiciona ao carrinho (validação preço/publicação/estoque — quando política existir).
3. Checkout: identificação / endereço (se necessário) / revisão.
4. **Criar pedido** com estado inicial (ex.: `pending_payment` ou manter `pending` **(Fato)** até decisão).
5. Iniciar pagamento (redirect, PIX, etc.) com **idempotency key**.
6. Webhook ou polling confirma pagamento → atualiza pedido → (opcional) baixa estoque definitiva.

## 5.3 Estados mínimos do pedido **(Proposta)**

- Alinhar com colunas atuais `status`, `payment_status` **(Fato)** em `orders`; evoluir enum documentado: ex. `draft` (opcional), `awaiting_payment`, `paid`, `cancelled`, `fulfilled`.
- Documentar transições permitidas e quem as dispara (operador, sistema, gateway).

## 5.4 Pedido criado vs pagamento confirmado **(Proposta)**

- **Opção A (pedido antes do pagamento):** pedido `pending` + `payment_status = pending`; confirmação muda `payment_status` para `paid`.
- **Opção B (reserva + expiração):** ver §6.
- Compatibilidade: novos estados como **extensão aditiva** de TEXT/enum sem quebrar leitores que só verificam `pending`/`paid` **(Fato)**.

## 5.5 Idempotência **(Proposta)**

- `POST /api/orders` deve aceitar **`Idempotency-Key`** (header) ou `client_order_uuid` no body para evitar duplicidade em retry de rede.
- Pagamento: mesma chave entre tentativas de criação de cobrança.
- Resposta: retornar o **mesmo** pedido se a chave já foi processada.

## 5.6 Compatibilidade com a arquitetura atual **(Fato + Proposta)**

- Manter contrato de `ordersController` até versão v2; adicionar campos opcionais.
- Carrinho: hoje `addToCart` busca produto por id sem checagem completa de tenant na leitura do produto em um dos fluxos **(Fato observado no diagnóstico)** — reforçar na fase de segurança/checkout.
- Separar mentalmente `checkout-context` SaaS (`index.ts`) do checkout da loja.

## 5.7 Decisões em aberto (checkout/pagamento)

- Gateway único da plataforma vs por tenant.
- Pedido só após pagamento aprovado vs antes.
- Reembolso, chargeback, estorno parcial.
- Nota fiscal / integração fiscal (fora de escopo catálogo, mas impacta estados).

---

# 6. Estoque, reserva e concorrência **(Proposta)**

> **(Fato)** `products.stock_quantity`, `min_stock_quantity` existem no schema; serviços tipicamente sem estoque físico; carrinho não altera estoque no código analisado de forma transacional explícita no plano atual.

## 6.1 Quando validar estoque

- **Adicionar ao carrinho:** validar disponibilidade **lógica** (opcional na v1; recomendado antes de oversell).
- **Início do checkout / criar pedido:** validar novamente preço e disponibilidade.
- **Serviços:** validar capacidade/agenda se no futuro houver “vagas” — senão, apenas disponibilidade comercial (`active` + `is_public`).

## 6.2 Quando reservar

- **(Proposta)** Reserva **soft** ao confirmar checkout (antes do pagamento): decrementar `available = stock - reserved` em tabela auxiliar ou colunas `reserved_quantity`, com **TTL** (ex.: 15 min).
- **Sem reserva:** apenas validação no último momento — maior risco de oversell sob pico.

## 6.3 Quando abater

- **Pagamento confirmado:** abater estoque definitivo e liberar reserva **(Proposta)**.
- **Pedido sem pagamento prévio:** abater na confirmação do pedido (B2B) — decisão de negócio.
- **Serviço:** normalmente sem abatimento de `stock_quantity`; pode registrar “consumo” em outro módulo.

## 6.4 Evitar oversell

- Transação DB: `UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2 AND stock_quantity >= $1` com row count check **(Proposta)**.
- Ou fila serializada por SKU para hot items.
- **Variações:** se preço/variação for por combinação, estoque pode precisar tabela `product_variant_stock` — hoje JSONB **(Fato)** complica consistência; decisão em §15.

## 6.5 Pagamento pendente e carrinho abandonado **(Proposta)**

- Reserva expira; job limpa reservas órfãs.
- Pedido `awaiting_payment` expira e cancela reserva automaticamente.

## 6.6 Item indisponível durante o fluxo **(Proposta)**

- Checkout: erro amigável + remoção automática da linha ou hold para troca.
- Pedido já pago: regra de estorno/substituição (operacional, não catálogo).

---

# 7. Estratégia de mídia **(Proposta)**

> **(Fato)** Campos `images`, `secondary_images` JSONB em `products`; UI com upload incompleto em `ProductForm.tsx`.

## 7.1 Imagem principal e galeria

- **Principal:** primeira posição de `images` ou coluna explícita `primary_image_index` / URL dedicada (decisão).
- **Galeria:** ordem estável (array ordenado); máximo N arquivos (ex.: 10) por produto para custo e UX WhatsApp.

## 7.2 Formatos e limites recomendados

- Web: JPEG/PNG/WebP; tamanho máximo por arquivo (ex.: 2–5 MB); dimensão máxima lado longo (ex.: 2048 px); gerar **derivados** (thumb, medium) para lista e chat.

## 7.3 Storage e CDN

- Objeto privado vs bucket público para vitrine; URLs **públicas** apenas para assets da vitrine; **URLs assinadas** para rascunhos/admin se necessário.
- CDN na frente do bucket para OG e chat.

## 7.4 Preview / og:image / links compartilhados

- Página pública do produto deve servir `<meta property="og:image" content="...">` com URL **HTTPS** absoluta no **host canônico** (§4).
- **(Proposta)** Rota dedicada ou SSR para crawlers (WhatsApp, Facebook) — SPAs puros frequentemente precisam de prerender ou middleware.

## 7.5 Uso no chat e WhatsApp

- Enviar: URL canônica + **thumbnail** URL (CDN) no corpo ou anexo conforme API do canal.
- Galeria: no chat interno, carousel limitado (ex.: 3–5 imagens); no WhatsApp, respeitar limites da API.

## 7.6 O que é público vs não expor **(Fato + Proposta)**

- **Não** expor em DTO público: `cost`, `contract_template`, `responsible_id`, JSONB interno completo, rascunhos.
- **Público:** nome, descrições acordadas, preço de venda, imagens da vitrine, SKU apenas se decisão de produto.

---

# 8. Matriz de permissões por canal **(Proposta)**

Legenda: **L** listar, **D** detalhe, **E** editar, **P** publicar/despublicar, **S** enviar link/mensagem com metadados. Campos = subset típico de resposta.

| Contexto | L | D | E | P | S | Campos típicos permitidos (resposta) |
|----------|---|---|---|---|---|--------------------------------------|
| **Admin interno** (role + `can_*` módulo `products`) | Sim* | Sim* | Sim* | Sim* | N/A | Completo: custo, contrato, rascunho, estoque, todas imagens **(Proposta)** |
| **Usuário interno sem permissão** | Não | Não | Não | Não | Não | — |
| **Operador comercial / chat** (`can_view` + idealmente `chat` + uso operacional) | Sim (catálogo canal) | Sim (card) | Não | Não | Sim (deep link + texto rico) | Nome, tipo, preço exibido, moeda, `short_description`, `primary_image`, subset galeria, `public_url` **(Proposta)** |
| **WhatsApp (cliente final)** | Não (API CRM) | Via link público | Não | Não | Recebe link | O que a **página pública** expõe + OG **(Proposta)** |
| **Visitante loja** | Sim (vitrine) | Sim (produto público) | Não | Não | N/A | DTO público mínimo + galeria pública **(Proposta)** |

\* **(Fato)** Hoje GET interno não usa `assertModulePermission` com ação `view` — a coluna “Sim” é **desejado**; estado real pode permitir mais do que a UI mostra.

**Quem pode enviar link:** operador autenticado com permissão de enviar mensagem no chat; o **conteúdo** do link é sempre **público** (visitante abre sem login). **(Proposta)**

---

# 9. Gap analysis

**Legenda:** B/M/A = complexidade; L/M/H = risco. **(Proposta)** nas recomendações.

| Tema | Estado atual **(Fato)** | Estado desejado **(Proposta)** | Gap | Risco | Complexidade | Recomendação |
|------|-------------------------|--------------------------------|-----|-------|--------------|--------------|
| Modelo de dados | `products` + JSONB | Alinhado UI/API; snapshots fatura | Persistência vs UI | H | A | Aditivo |
| Domínio/URL | Path `/{slug}/loja` + APIs por userId/slug **(Fato)** | Sequência: path → subdomínio plataforma → **subdomínio no domínio do cliente** (premium); apex depois | Resolução `Host` + onboarding DNS (§4.9) | M | A | Desenhar sequência cedo; implementar por patamar |
| Produto vs serviço | `type` + UI | Validação server por tipo | Zod condicional | M | M | Fase 2–3 |
| Categorias | TEXT livre | FK categorias | Schema | M | M | Migration futura |
| Imagens / galeria | JSONB; upload fraco | Storage + CDN + OG | Pipeline | M | A | Fase dedicada mídia |
| Loja pública | Lista/detalhe com riscos | DTO + paginação | API+FE | H | M | Fase 1 |
| Checkout/pagamento | Pedido+carrinho | Checkout + idempotência + gateway | Estados + keys | H | A | Após DTO público |
| Estoque/reserva | Colunas; sem reserva formal | Política + opcional TTL | Modelo + jobs | M | A | Após checkout definido |
| Integração faturas | `product_id` opcional | Snapshot oficial | Colunas service | M | M | Fase após FE/BE |
| Chat/WhatsApp | Via fatura | Channel API + deep link | Endpoints | M | M | Após URL canônica |
| Segurança / permissões | GET view fraco | `view` + matriz canal | Middleware | H | M | Fase 1 |
| Performance | Lista cheia | Paginação | Query+UI | M | M | Fase UX admin |
| Auditoria | Pouco | Trilha alterações | Tabela/log | L | M | Avançado |
| UX cadastro/listagem | Longo / sem filtro | Alinhado e filtrável | UI | M | B/M | Intercalado |

---

# 10. Proposta de arquitetura evolutiva **(Proposta)**

## 10.1 Aproveitar **(Fato)**

- `products`, `store_profiles`, carrinho/pedidos, controllers como fachada evolutiva.

## 10.2 Reorganizar conceitualmente

- **CatalogAdminService**, **CatalogPublicService** (DTO mínimo), **CatalogChannelService** (read-only enriquecido com `public_url`).

## 10.3 Aditivo

- Novas rotas, colunas nullable, feature flags.

## 10.4 Não quebrar agora

- JSONB variações até modelo novo; rotas públicas legadas com deprecação.

## 10.5 Endpoints ideais (resumo)

- Admin paginado; público por `slug`; canal `/api/catalog/channel/...`; faturas com snapshot no service layer.

---

# 11. Estratégia de rollout por fases — **V2 repriorizada** **(Proposta)**

| # | Fase | Objetivo | Entregas (exemplos) | Migration? | Feature flag obrigatória? | Rollout |
|---|------|----------|---------------------|------------|----------------------------|---------|
| **V2-1** | Segurança pública + permissões leitura interna | DTO público; endpoint detalhe público; corrigir `PublicProduct`; `assertModulePermission` view em GET admin | `productsController`, `PublicProduct`, middleware | Opcional | **Sim** | Canário |
| **V2-2** | Alinhamento FE/BE | Zod + remoção/persistência campos fantasmas; `status` create | `productSchema`, `products.ts`, `ProductForm` | Se novos campos | **Sim** | Gradual |
| **V2-3** | Integração oficial faturas | Snapshot em itens; contrato API/UI | `customerInvoiceService`, `CustomerInvoiceNew` | **Sim** (snapshots) | Sim | Piloto financeiro |
| **V2-4** | Catálogo read-only chat/WhatsApp + deep links | Endpoints channel; picker no `Chat.tsx`; URL canônica documentada em config | Backend + FE chat | Não | **Sim** | Piloto atendimento |
| **V2-5** | UX admin + categorias base | Paginação/filtro; `category_id` ou normalização mínima | `Products.tsx`, API | **Sim** (categorias) | Sim | — |
| **V2-6** | Mídia madura | Upload, CDN, ordem, OG básico | Storage + `ProductForm` | Opcional | Sim | — |
| **V2-7** | Vitrine pública evoluída | Paginação pública; SEO; galeria | `PublicStore` | Não obrig. | Sim | Canário |
| **V2-8** | Checkout/pagamento completo | Idempotência; estados; gateway vitrine | `ordersController`, novo fluxo | **Sim** provável | **Sim** | **Obrigatório** canário + rollback |
| **V2-9** | Host premium: **subdomínio no domínio do cliente** + landing (app/loja); **apex opcional fase posterior** | `tenant_hosts` (ou equivalente), TLS, validação DNS (§4.9), redirects | Infra + settings | **Sim** | Sim | **Premium**; apex fora do escopo imediato desta fase |
| **V2-10** | Avançado | Estoque reservado, auditoria, A/B | Vários | Sim possível | Sim | — |

---

# 12. Observabilidade, testes e rollback **(Proposta)**

## 12.1 Métricas por fase (exemplos)

- **V2-1:** taxa de 4xx/5xx em `/api/products/public/*`; latência p95; contagem de respostas com campos proibidos (validação contrato).
- **V2-4:** uso do endpoint channel; mensagens com link gerado; CTR link aberto (se analytics).
- **V2-8:** conversão checkout; pedidos duplicados (deve → 0 com idempotência); tempo até `paid`.

## 12.2 Logs relevantes

- Estruturados: `tenant_id`, `user_id`, `route`, `idempotency_key`, `order_id`, resultado pagamento; negar log de PAN/dados sensíveis.
- Já existe padrão de permission denied no engine **(Fato)** — estender a catálogo público (tentativa de acesso inválido).

## 12.3 Testes de contrato

- Schemas JSON para DTO público, channel e admin; quebrar CI se campos sensíveis aparecerem no público.
- Teste: `GET público` nunca retorna `cost`, `contract_template`.

## 12.4 Smoke tests

- Vitrine: slug válido → lista → detalhe → add cart → create order (ambiente staging).
- Chat: picker → envia mensagem com link → abre em aba anônima.

## 12.5 Canário / tenant piloto

- Feature flag por `tenant_id`; 1–2 tenants com suporte dedicado antes de rollout geral.
- **V2-8 (pagamento):** canário **obrigatório**; não liberar global sem janela de observação.

## 12.6 Rollback

- Flags desligam novo comportamento; rotas antigas permanecem; migrations **só aditivas** para rollback de código sem rollback de DB destrutivo.
- Se migration já aplicou colunas obrigatórias: código novo deve tolerar NULL (compat §13).

## 12.7 Feature flag obrigatória **(Proposta)**

- **Obrigatória:** V2-1 (público), V2-2 (schema), V2-3 (fatura), V2-4 (chat), **V2-8 (checkout/pagamento)**, V2-9 (subdomínio do cliente + onboarding DNS).
- **Recomendada:** demais fases.

---

# 13. Compatibilidade e preservação de produção **(Proposta operacional)**

- Aditivo: novas rotas e colunas nullable.
- Preservar `POST /api/orders`, `/api/cart/*`, rotas atuais de produtos durante transição.
- Tenants legados: URLs antigas com redirect; produtos sem imagem ok.
- Regressão: testar pedido + fatura + embed chat após cada fase crítica.

---

# 14. Riscos críticos e mitigação **(Proposta)**

| Risco | Mitigação |
|-------|-----------|
| Vazamento DTO | Projeção SQL + testes contrato |
| Duplicidade pedido/pagamento | Idempotency-Key + UNIQUE DB opcional |
| Oversell | Transação stock ou reserva + TTL |
| Host do cliente (subdomínio) | Premium; fluxo §4.9; erros DNS/`erro` suportados; monitor cert; **apex** só em fase posterior |
| UX rollout | Flags + piloto |

---

# 15. Decisões arquiteturais em aberto **(Proposta)**

Inclui itens da V1 mais: **resolução de host** (três cenários §4.1; **apex fora do premium inicial**); **página principal tenant**; **estratégia OG (SSR/prerender)**; **gateway vitrine**; **estoque por variação**; **TTL reserva**; **lista de campos por canal** congelada em spec OpenAPI.

---

# 16. Análise da ordem de fases: proposta do negócio vs plano V1 **(Proposta)**

**Ordem sugerida pelo negócio:**

1. Segurança pública  
2. Alinhamento frontend/backend  
3. Integração oficial com faturas  
4. Camada read-only catálogo chat/WhatsApp + deep links  
5. UX admin / paginação / filtros / categorias base  
6. Mídia madura  
7. Vitrine pública evoluída  
8. Checkout/pagamento completo  
9. Melhorias avançadas  

**Avaliação:** essa ordem é **superior** à V1 original em um ponto central: coloca **integração com faturas (3)** e **canal chat (4)** **antes** de investir pesado em **vitrine evoluída (7)** e **checkout completo (8)**. Isso maximiza **valor operacional** (faturamento e atendimento) com **menor superfície** que checkout+gateway.

**O que a V1 fazia:** após FE/BE, priorizava categorias + UX admin e vitrine antes de fatura oficial e chat — o que **atrasava** deep links estáveis e snapshots de fatura usados no dia a dia.

**Ajuste recomendado (V2):** adotar a ordem **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9**, com ressalvas:

- **Entre 1 e 4:** definir **especificação mínima de URL canônica** (mesmo que só com path+origin) para links do chat não quebrarem na fase 7–9.
- **6 (mídia)** pode **paralelizar** com 5 parcialmente (thumbs mínimos antes de OG perfeito).
- **8 (checkout/pagamento)** permanece **tarde** e **sempre** com flag + canário — depende de 1 (DTO) e idealmente de 7 (UX vitrine).
- **Host premium (§4):** **subdomínio no domínio do cliente** na **V2-9**, fora do núcleo 1–8; **subdomínio da plataforma** pode anteceder ou integrar evolução da vitrine conforme capacidade; **apex** não embutido nessa fase.

**Conclusão:** **sim, a ordem sugerida pelo negócio é preferível** à ordem da V1 para **valor/segurança**; a V2 incorpora essa ordem nas fases V2-1…V2-10, com **V2-9** focada em **subdomínio do cliente** + onboarding DNS, não em apex.

---

# 17. Recomendação final **(Proposta)**

| Caminho | Descrição |
|---------|-----------|
| **Mais seguro** | V2-1 → V2-2 → V2-3 → V2-4 com flags e canário em cada; só depois 5–7; 8 isolado. |
| **Mais rápido (valor)** | V2-1 → V2-2 → **V2-3** → **V2-4** mínimo (sem picker luxuoso); adiar 6–7 estéticos. |
| **Ideal** | Sequência V2-1…V2-8 conforme §11; V2-9 premium sob demanda; V2-10 contínuo. |

**Primeiro:** segurança pública + view permission. **Não adiar:** contrato FE/BE. **Subir cedo valor interno:** fatura oficial + channel chat. **Deixar por último no núcleo:** checkout/pagamento completo. **Host:** consolidar **path legado** e, em seguida, **subdomínio da plataforma**; **subdomínio no domínio do cliente** na **V2-9**; **apex** apenas em fase posterior.

---

# 18. Referências de código **(Fato)**

| Área | Referência |
|------|------------|
| Produtos | `productsController.ts`, `productsRoutes.ts` |
| Loja | `storeProfileController.ts`, `storeProfileRoutes.ts` |
| Carrinho / pedidos | `cartController.ts`, `ordersController.ts`, `cartRoutes.ts`, `ordersRoutes.ts` |
| Schema | `database/init/06_create_products.sql` |
| UI admin / público | `Products.tsx`, `ProductForm.tsx`, `PublicStore.tsx`, `PublicProduct.tsx`, `products.ts` |
| Fatura | `customerInvoicesController.ts`, `CustomerInvoiceNew.tsx` |
| Chat | `Chat.tsx` |
| Busca | `searchController.ts` |
| Rotas app / API | `App.tsx`, `packages/backend/src/index.ts` |

---

# 19. Tabela final de decisão **(Proposta)**

| Tema | Entrar no plano agora | Implementar já | Fase sugerida | Motivo |
|------|----------------------|----------------|---------------|--------|
| Path legado `/{slug}/loja` | Sim | Já **(Fato)** | — | Base atual; formalizar canônico |
| Subdomínio da plataforma (`{slug}.loja.plataforma.com`) | Sim | Opcional após DTO público | Entre V2-1 e V2-7 | Caminho **mais simples** após path; infra própria |
| Subdomínio no domínio do cliente (`loja.cliente.com.br`, `app.cliente.com.br`) | Sim | Não | **V2-9 (premium inicial)** | Onboarding DNS §4.9; TLS por host |
| Domínio raiz/apex do cliente (`cliente.com.br`) | Sim (só como decisão futura) | Não | **Fase posterior** | Mais complexo que subdomínio; **fora** do premium inicial |
| Página principal tenant (app vs loja) | Sim | Não | V2-9+ | Combina com dois hosts no cenário 3 **(Proposta)** |
| Link público de produto | Sim | Sim (especificação) | V2-1 | Segurança + chat dependem disso |
| Deep link no chat | Sim | Após URL estável | V2-4 | Valor atendimento; precisa DTO/link |
| Integração com fatura (snapshot) | Sim | Após FE/BE | V2-3 | Conformidade e relatórios |
| Checkout/pagamento | Sim (plano) | Não | V2-8 | Gateway + idempotência; alto risco |
| Estoque/reserva | Sim (política) | Não | V2-8 ou V2-10 | Depende regra de checkout |
| Mídia/galeria | Sim | Gradual | V2-6 | Upload + CDN; OG pode ser fase 2 da mídia |
| Permissões por canal | Sim | Sim (matriz) | V2-1 + V2-4 | Reduz vazamento e erro operacional |

---

*Documento V2 (v2.1 — refino de host) para tomada de decisão arquitetural. Revisar após definição de gateway da vitrine, wildcard da plataforma e política de host do cliente (subdomínio vs apex).*
