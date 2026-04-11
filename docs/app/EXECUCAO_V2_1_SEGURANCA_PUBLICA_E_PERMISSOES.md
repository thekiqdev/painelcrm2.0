# Plano de execução — Fase V2-1: segurança pública e permissões de leitura interna

**Origem:** `docs/app/PLANO_EVOLUCAO_MODULO_CATALOGO.md` (fase **V2-1**).  
**Escopo deste documento:** apenas planejamento de sprint — **sem implementação**, **sem alteração de código**, **sem migrations**, **sem patch**.  
**Convenção:** **(Fato)** = observado no repositório; **(Recomendação)** = decisão proposta para a fase.

---

# 1. Objetivo da fase

## O que a V2-1 precisa resolver **(Fato + alinhamento ao plano)**

- Eliminar **vazamento de dados** na API pública de produtos (`getPublicProducts` usa `SELECT *` e repassa `cost` e demais colunas internas) em `packages/backend/src/controllers/productsController.ts`.
- Corrigir o **fluxo da página pública de detalhe** (`src/pages/PublicProduct.tsx`), que hoje chama `productsService.getProductById` → `GET /api/products/:id`, rota **protegida** por `tenantAuthCrm` em `productsRoutes.ts`, incompatível com visitante anônimo **(Fato)**.
- Alinhar **leitura interna** (`getProducts`, `getProductById`) à permissão de módulo **`can_view`** para o módulo `products`, hoje **ausente** nos handlers de GET **(Fato)** — `create`/`update`/`delete` já usam `assertModulePermission`.
- Corrigir **bypass de gate** no frontend: `RequireModuleView` em `src/components/RequireModuleView.tsx` mapeia `pathname.startsWith('/products')` mas **não** `/admin/products`, retornando `children` sem checagem quando `moduleId === null` **(Fato)**.

## Riscos que a fase reduz **(Fato)**

| Risco | Origem |
|-------|--------|
| Exposição pública de custo, contrato, SKU interno, `responsible_id`, etc. | `getPublicProducts` + spread da linha completa |
| Vitrine quebrada ou dependente de token | `PublicProduct` + `GET /api/products/:id` |
| Usuário sem `can_view(products)` lendo catálogo via API | GET sem `assertModulePermission` |
| Usuário acessando UI admin de produtos sem permissão | `/admin/products` fora de `pathToModule` |

## Por que antes das demais fases **(Recomendação)**

- Deep links, chat e evolução de URL canônica **presumem** um **contrato público estável e seguro**; construir em cima do `SELECT *` atual acopla features futuras a vazamento de dados.
- Corrigir permissão de **view** antes de V2-2 (contrato FE/BE) evita que novos clientes (ex.: picker de catálogo) dependam de buraco de autorização.

---

# 2. Escopo exato da V2-1

## 2.1 Entra nesta fase **(Recomendação)**

- Revisão e **endurecimento** de `getPublicProducts` (`productsController.ts`): **projeção SQL explícita** ou mapeamento para **DTO público**; nunca retornar colunas sensíveis.
- **Novo endpoint público de detalhe** do produto (sem `tenantAuthCrm`), com validação `status = 'active'`, `is_public = true` e pertença ao dono da loja (via `user_id` do produto alinhado ao `store_profiles` do slug ou via `userId` já resolvido — ver §4).
- Ajuste de **`PublicProduct.tsx`** para usar apenas fluxo público (novo método em `src/services/products.ts`).
- Inclusão de **`assertModulePermission(..., 'products', 'view', ...)`** (ou equivalente) em **`getProducts`** e **`getProductById`**, após estender a API de `assertModulePermission` para aceitar ação `'view'` **(Fato: hoje a assinatura só tipa `'create' \| 'edit' \| 'delete'`, embora `permissionEngine.ts` já trate `view`)**.
- Ajuste de **`RequireModuleView.tsx`**: mapear **`/admin/products`** (e subpaths) para o módulo `products`.
- Documentação interna do **contrato público mínimo** (lista + detalhe) para consumo da vitrine e testes de contrato.

## 2.2 Não entra nesta fase **(Recomendação)**

- Checkout, pagamento, idempotência de pedido, gateway.
- Chat/WhatsApp, endpoints “channel”, picker em `Chat.tsx`.
- Categorias estruturadas (`category_id`), migrations de taxonomia.
- Upload maduro, CDN, OG tags completas (salvo se indispensável para “segurança”, o que não é o caso).
- Domínio por tenant, subdomínio, `tenant_hosts`, onboarding DNS.
- Refator grande do modelo de catálogo (variantes, novo aggregate).
- Snapshots de fatura (V2-3).
- Paginação/filtros na listagem admin **(Fato: não é pré-requisito de segurança)** — exceto se surgir necessidade mínima para teste de carga (não prevista).

---

# 3. Diagnóstico técnico focado na V2-1 **(Fato)**

## 3.1 Backend — rotas e controllers

| Item | Detalhe |
|------|---------|
| Rotas | `packages/backend/src/routes/productsRoutes.ts`: `GET /public/:userId` (público); após `router.use(...tenantAuthCrm)`: `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`. |
| Montagem | `packages/backend/src/index.ts` — `app.use('/api/products', productsRoutes)`. |
| `getPublicProducts` | `productsController.ts` ~L287–311: `SELECT * FROM products WHERE user_id = $1 AND status = 'active' AND is_public = true`. |
| `getProducts` | ~L41–68: `SELECT p.*` com `joinUserTenant`; sem permissão `view`. |
| `getProductById` | ~L70–101: `SELECT p.*` com `joinUserTenantByUserId`; sem permissão `view`. |
| Mutações | `createProduct`, `updateProduct`, `deleteProduct` já chamam `assertModulePermission`. |

## 3.2 Frontend — páginas e serviços

| Item | Detalhe |
|------|---------|
| `PublicStore.tsx` | `getPublicStoreBySlug` + `getPublicProducts(store.user_id)` — recebe payload completo da API pública hoje. |
| `PublicProduct.tsx` | L34–37: `getProductById(productId)` + validação client-side `user_id`, `is_public`, `status`. |
| `products.ts` | `getPublicProducts`, `getProductById` (`/api/products/:id`), demais métodos admin. |
| Admin | `Products.tsx`, `ProductForm.tsx`, `CustomerInvoiceNew.tsx` usam `getProducts` / `getProductById` autenticados. |

## 3.3 Tabelas / colunas **(Fato)**

- `public.products` — todas as colunas em `database/init/06_create_products.sql`; a fase **não** exige migration se apenas projeção/DTO mudar na aplicação.

## 3.4 Permissões **(Fato)**

- Módulo `products` em `modulePermissionsService.ts`; `role_module_permissions` com `can_view`, etc.
- `permissionEngine.ts` — ramo `action === 'view'` exige `p.can_view === true`.
- `assertModulePermission` (`assertModulePermission.ts`) — **não inclui `'view'` no tipo do parâmetro `action`** (L45–48); mensagens para `view` existem (L25–30) mas não há ramo `if (action === 'view')` de throw dedicado como em `create` — **extensão necessária** para uso consistente em GET.

## 3.5 Problemas atuais e risco **(Fato)**

| Problema | Risco |
|----------|--------|
| `SELECT *` / spread em público | **Alto** — vazamento de dados comerciais e operacionais |
| Detalhe público via rota autenticada | **Alto** — vitrine falha ou comportamento incoerente com token |
| GET interno sem `view` | **Médio/Alto** — bypass de RBAC por API |
| `/admin/products` sem `pathToModule` | **Médio** — bypass de UI vs intenção do módulo |

---

# 4. Decisões técnicas da fase **(Recomendação)**

## 4.1 DTO público mínimo

- **Lista pública** e **detalhe público** devem compartilhar o **mesmo subset** de campos (detalhe = lista + eventualmente mais texto de descrição, sem abrir novos sensíveis).
- Serialização explícita no backend (função tipo `toPublicProductRow(row)` ou `SELECT` com colunas nomeadas) para **não depender** de “omitir no spread”.

## 4.2 Campos permitidos publicamente (lista + detalhe)

- `id`, `name`, `type`, `short_description`, `description`, `price`, `discount_price`, `currency`, `category`, `images`, `secondary_images`, `features`, `variations` (se a vitrine precisar exibir opções — **decisão:** incluir apenas se JSON já for considerado “de vitrine”; caso contrário omitir na V2-1 e mostrar só preço principal).
- Serviço: `duration_hours`, `is_recurring`, `recurrence_interval` (apenas exibição).
- `created_at` / `updated_at` — **opcional**; omitir na V2-1 salvo necessidade de ordenação na UI (já há ordenação no servidor).

## 4.3 Campos proibidos publicamente **(Recomendação)**

- `user_id` (enumerável; detalhe pode validar só no servidor), `cost`, `sku`, `stock_quantity`, `min_stock_quantity`, `responsible_id`, `contract_template`, `has_contract`, `status` (substituir por confirmação implícita “ativo+público” sem expor rascunho), `is_public` (redundante após filtro), qualquer campo interno futuro não listado no allowlist.

**Nota:** omitir `user_id` na resposta pública implica validar **no servidor** que o produto pertence à loja (slug ou `userId` interno na query).

## 4.4 Endpoint público de detalhe

**Opções:**

| Opção | Rota exemplo | Prós | Contras |
|-------|----------------|------|---------|
| **A** | `GET /api/products/public/:userId/:productId` | Alinhado ao padrão da lista; implementação mínima | `userId` visível em DevTools (já ocorre na lista) |
| **B** | `GET /api/products/public/store/:slug/product/:productId` | Um request; não exige cliente concatenar `userId` | Resolver `slug` → `user_id` no servidor; ordem de rotas Express |

**Recomendação:** **Opção B** como preferida para detalhe (coerente com URL da loja baseada em slug); **Opção A** aceitável como **MVP** se prazo apertar, desde que DTO seja seguro e `PublicProduct` deixe de usar `getProductById` autenticado.

**Ordem de registro em `productsRoutes.ts` (Fato técnico Express):** rotas **mais específicas** (`/public/store/...` ou `/public/:userId/:productId`) **antes** de `/public/:userId` e **antes** de `router.use(tenantAuthCrm)`.

## 4.5 Endpoint atual `GET /public/:userId`

- **Manter** com corpo resolvido para DTO público (compatibilidade com `PublicStore` e `getPublicProducts`).
- **Deprecação:** opcional header `Deprecation` / documentação interna; **não** remover na V2-1.

## 4.6 Página `PublicProduct`

- Fluxo: resolver loja por slug (já existe) → chamar **novo** método `getPublicProductBySlugAndId` ou equivalente → remover `getProductById` dessa página.
- Validações que hoje são client-side (`user_id`, `status`, `is_public`) passam a ser **só servidor**; UI trata 404.

## 4.7 Permissão `view` no backend

- Estender **`assertModulePermission`** para aceitar `action: 'create' | 'view' | 'edit' | 'delete'` e, para `view`, lançar `ModulePermissionError` com mensagem de view (espelhar padrão de `create`).
- Em **`getProducts`:** após `tenantId` válido, `await assertModulePermission(req.userId!, 'products', 'view', undefined, req)`.
- Em **`getProductById`:** após encontrar o produto (ou antes da query — preferível **após** 404 de existência para não vazar existência de IDs entre tenants; **decisão fina:** documentar se 403 vs 404 em cross-tenant; **recomendação:** manter 404 para ID inexistente ou fora do tenant, 403 apenas quando recurso existe no tenant mas sem `can_view`).

**Matriz recomendada (revisar com segurança):**

- Produto não existe ou não está no tenant do usuário → **404**.
- Produto no tenant, usuário sem `can_view` → **403**.

Isso pode exigir query em duas etapas ou join com checagem de permissão após localizar `user_id` do dono do produto.

## 4.8 `/products` vs `/admin/products`

- **Frontend:** incluir `pathname.startsWith('/admin/products')` em `pathToModule` **antes** ou **junto** com `/products` (ordem: `/admin/products` mais específico primeiro se usar `startsWith` genérico — hoje `/admin/products` não começa com `/products`, então basta adicionar condição explícita).

## 4.9 Compatibilidade

- Respostas **internas** de `getProducts` / `getProductById` podem permanecer com o shape atual **(admin)** após checagem `view`; **não** é obrigatório na V2-1 separar DTO admin vs row completo, desde que não haja novo vazamento (admin já autenticado).
- **Recomendação opcional (fora do mínimo):** em fase única, documentar DTO admin futuro; não bloquear V2-1.

---

# 5. Plano de execução em passos **(Recomendação)**

## Passo 1 — Endurecer contrato público (lista)

- **Arquivos:** `productsController.ts`, opcionalmente módulo helper `catalogPublicDto.ts` (novo).
- **Ações:** substituir `SELECT *` por lista explícita de colunas ou mapear objeto permitido; garantir `parseFloat` só em campos expostos; teste de ausência de chaves proibidas.
- **Dependências:** nenhuma migration.
- **Risco:** baixo se apenas projeção; médio se front da vitrine esperava campo removido (verificar `PublicStore` / cards).

## Passo 2 — Criar detalhe público correto

- **Arquivos:** `productsController.ts` (nova função `getPublicProductBySlugAndId` ou nome equivalente), `productsRoutes.ts` (nova rota **antes** do `tenantAuthCrm`).
- **Ações:** JOIN ou sequência: `store_profiles.store_slug` → `user_id` → `products` com `id`, filtros `active` + `is_public` + `user_id` match; retornar DTO público; 404 caso contrário.
- **Dependências:** Passo 1 alinhado ao mesmo DTO.
- **Risco:** médio — ordem de rotas Express; erro 404/403 semântico.

## Passo 3 — Corrigir frontend público

- **Arquivos:** `src/services/products.ts`, `src/pages/PublicProduct.tsx`; opcional tipo `PublicProductDto` em `src/types/products.ts` ou arquivo dedicado.
- **Ações:** novo método chamando endpoint público; remover `getProductById` da página pública; ajustar tipos se `user_id` sumir do DTO.
- **Dependências:** Passo 2 deployado ou feature flag ligada.
- **Risco:** médio — regressão de vitrine; testar anônimo.

## Passo 4 — Alinhar permissão de leitura interna

- **Arquivos:** `assertModulePermission.ts`, `productsController.ts` (`getProducts`, `getProductById`).
- **Ações:** estender tipo `action` com `'view'`; implementar throw para view negada; chamar assert em ambos GET; definir semântica 403 vs 404.
- **Dependências:** `tenantAuthCrm` já popula `req.userId` / `req.tenantId` / `permissionMap` conforme middleware existente.
- **Risco:** **alto** — quebra clientes (ex.: integrações) que chamavam GET sem `can_view`; exigir **feature flag** ou rollout gradual (§10).

## Passo 5 — Corrigir gate de rotas do módulo

- **Arquivos:** `RequireModuleView.tsx`.
- **Ações:** `if (pathname.startsWith('/admin/products')) return 'products';` (ou equivalente).
- **Dependências:** nenhuma backend.
- **Risco:** médio — usuários que acessavam URL direta passam a ser bloqueados (comportamento desejado).

## Passo 6 — Validação final e rollout

- **Arquivos:** testes (§9), monitoração, flags.
- **Ações:** executar bateria §9; habilitar flag por tenant ou global; monitorar 403/404 em `/api/products`.
- **Dependências:** Passos 1–5.
- **Risco:** operacional — reverter flag se pico de erros.

---

# 6. Arquivos impactados **(Recomendação)**

## Backend

| Arquivo | Motivo | Tipo de mudança |
|---------|--------|-----------------|
| `packages/backend/src/controllers/productsController.ts` | DTO público, novo handler GET público, assert view em GET internos | Alteração + possível função nova |
| `packages/backend/src/routes/productsRoutes.ts` | Nova rota pública; ordem das rotas | Alteração |
| `packages/backend/src/permissions/assertModulePermission.ts` | Suporte a ação `view` | Alteração |
| `packages/backend/src/permissions/index.ts` | Reexport se necessário | Opcional |

## Frontend

| Arquivo | Motivo | Tipo de mudança |
|---------|--------|-----------------|
| `src/services/products.ts` | Método público de detalhe | Alteração |
| `src/pages/PublicProduct.tsx` | Trocar origem dos dados | Alteração |
| `src/components/RequireModuleView.tsx` | Mapear `/admin/products` | Alteração |
| `src/types/products.ts` | Tipo público opcional | Opcional |

## Shared / contratos

| Arquivo | Motivo | Tipo de mudança |
|---------|--------|-----------------|
| Documentação OpenAPI / README interno | Se existir spec de API | Atualização futura opcional |

## Testes

| Arquivo | Motivo | Tipo de mudança |
|---------|--------|-----------------|
| Novo ou existente em `packages/backend/src/**/*.test.ts` | Contrato público, view, 404 | Adicionar casos |
| E2E/manual | Vitrine | Checklist §9.3 |

---

# 7. Contrato público proposto **(Recomendação)**

## 7.1 Listagem pública (`GET /api/products/public/:userId` — resposta)

Shape conceitual (JSON array de objetos):

- `id` (uuid)
- `name`
- `type` (`product` | `service`)
- `short_description` | null
- `description` | null
- `price` | null
- `discount_price` | null
- `currency`
- `category` | null
- `images` (array)
- `secondary_images` (array)
- `features` (array)
- `duration_hours` | null
- `is_recurring` | null
- `recurrence_interval` | null
- **`public_url`** | null ou string — **opcional na V2-1**; se não calculado, deixar para V2-4+ (apenas placeholder documental)

**Variações:** incluir `variations` apenas se produto for vendido com opções na vitrine **e** o JSON for considerado não sensível; caso contrário **omitir** na V2-1.

## 7.2 Detalhe público (novo endpoint)

- Mesmo shape que item da lista **ou** lista + campos extras **apenas** se forem subset seguro (ex.: `description` longa já na lista).

## 7.3 Campos proibidos (garantir ausência na serialização)

- `user_id`, `cost`, `sku`, `stock_quantity`, `min_stock_quantity`, `responsible_id`, `contract_template`, `has_contract`, `status`, `is_public`, `created_at`/`updated_at` (salvo decisão contrária), `updated_at` interno, qualquer coluna não allowlistada.

---

# 8. Compatibilidade e deprecação **(Recomendação)**

- **`GET /api/products/public/:userId`:** mantém path e método; apenas **corpo** da resposta muda (menos campos). Clientes que dependiam de `cost` na vitrine **não** devem existir em produção saudável — tratar como **correção breaking aceitável** com release note.
- **Novo endpoint de detalhe:** aditivo; não remove rotas antigas na V2-1.
- **`GET /api/products/:id` (autenticado):** permanece para admin; após `view`, clientes sem permissão recebem **403**.
- **Vitrine:** `PublicStore` continua usando lista pública; `PublicProduct` migra para novo método — sem quebra de rota React, só de fetch.
- **Terreno para fases futuras:** DTO público estável facilita channel API e URL canônica sem novo vazamento.

---

# 9. Testes da fase **(Recomendação)**

## 9.1 Testes backend

- Contrato JSON da lista pública: snapshot ou lista de chaves permitidas.
- Assert: resposta **não** contém `cost`, `user_id`, `contract_template`, etc.
- `getProducts` / `getProductById` com usuário `can_view = false` → **403** (quando recurso no tenant).
- Tenant isolation: usuário do tenant A não lê produto do tenant B → **404**.
- Detalhe público: produto inativo / `is_public = false` → **404**; slug inexistente → **404**; combinação slug+id válida → **200** com DTO.

## 9.2 Testes frontend

- Loja pública carrega lista sem login.
- Detalhe público abre em aba anônima sem `Authorization`.
- Deep link direto para `PublicProduct` funciona.
- Navegação para `/admin/products` com usuário sem `can_view` → redirecionamento/toast (comportamento `RequireModuleView`).

## 9.3 Testes manuais

- Visitante anônimo: loja + detalhe + refresh.
- Interno com `can_view`: lista admin e edição (edição já exige outras permissões).
- Interno sem `can_view`: API GET lista/detalhe internos retornam 403; UI não mostra módulo.
- Produto draft/inativo/privado: detalhe público 404.
- UUID inexistente: 404.

---

# 10. Rollout e mitigação **(Recomendação)**

- **Feature flag:** **sim** (plano V2-1) — separar: (a) DTO público + novo endpoint detalhe; (b) assert `view` em GET internos (podem ser flags distintas).
- **Canário:** 1 tenant interno + staging completo antes de produção.
- **Staging:** validar vitrine + `CustomerInvoiceNew` (usa `getProducts`) com perfis com/sem `can_view`.
- **Monitorar:** taxa de 403 em `GET /api/products`, 404 no novo endpoint público, erros JS em `PublicProduct`.
- **Reverter:** desligar flags — volta comportamento anterior **sem** rollback destrutivo de DB (V2-1 sem migration).

---

# 11. Critérios de aceite **(Recomendação)**

- [ ] Resposta de **`GET /api/products/public/:userId`** não contém campos da lista proibida (§7.3).
- [ ] Existe **endpoint público de detalhe** que não passa por `tenantAuthCrm` e retorna só DTO público.
- [ ] **`PublicProduct`** não chama mais `getProductById` (`/api/products/:id`).
- [ ] Visitante anônimo abre detalhe do produto público com sucesso.
- [ ] **`getProducts`** e **`getProductById`** exigem `can_view` no módulo `products` (com semântica 403/404 acordada).
- [ ] **`/admin/products`** passa pelo **`RequireModuleView`** como módulo `products`.
- [ ] Vitrine atual (`PublicStore`) funcional após mudança da lista.
- [ ] Nenhuma migration obrigatória na V2-1.
- [ ] Documento de release / notas internas sobre possível remoção de campos na API pública.

---

# 12. Pendências para V2-2 e seguintes **(Recomendação explícita)**

- Alinhamento completo **Zod** vs UI (`pricing_mode`, `variation_prices`, `status` no create) — **V2-2**.
- Snapshots em fatura — **V2-3**.
- API read-only para chat + deep links canônicos — **V2-4+**.
- Paginação admin, categorias, mídia, checkout, domínio — conforme plano geral.

---

*Documento gerado para execução da fase V2-1. Atualizar após implementação real se decisões 403/404 ou shape de DTO forem ajustadas em code review.*
