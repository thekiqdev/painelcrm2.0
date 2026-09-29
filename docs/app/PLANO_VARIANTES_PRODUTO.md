# Plano — Variantes de produto (modelo completo e-commerce)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Atualizado** | 2026-09-28 — Sprint 5 fechada · plano PV concluído |
| **Tipo** | Plano de implementação (produto + estoque + import + vitrine + checkout) |
| **Nome** | **PV — Product Variants** (variantes de catálogo) |
| **Escopo** | Modelo **completo** de produto simples vs variável: atributos Cor/Tamanho (até 2), variantes com SKU/preço/estoque/foto, import WooCommerce, vitrine e baixa de estoque no pedido |
| **Base** | `products` · `ProductForm.tsx` · import WC ([`PLANO_IMPORTACAO_PRODUTOS_WOOCOMMERCE.md`](./PLANO_IMPORTACAO_PRODUTOS_WOOCOMMERCE.md)) · checkout loja · `order_items` / `cart_items` |
| **Princípio** | Fazer **certo de uma vez** — tabela `product_variants` (não JSONB “pela metade”); pedido carrega `variant_id`; import WC gera variantes reais |
| **Fora de escopo (desta onda)** | 3+ eixos de atributo · sync bidirecional Woo REST · multi-armazém · reservas soft de estoque · matriz de preços avançada B2B |
| **Status** | **Concluído (S0–S5)** |
| **Kickoff** | — |

| Sprint | Foco | Status |
|--------|------|--------|
| **Sprint 0** | Decisões (ADR), inventário, schema draft, fixture variantes | **Feito** ([`SPRINT_PV_S0_INVENTORY_AND_DECISIONS.md`](./SPRINT_PV_S0_INVENTORY_AND_DECISIONS.md)) |
| **Sprint 1** | Migration `product_variants` + colunas no pai + RLS + API admin CRUD | **Feito** ([`SPRINT_PV_S1_SCHEMA_AND_API.md`](./SPRINT_PV_S1_SCHEMA_AND_API.md)) |
| **Sprint 2** | **ProductForm:** 1ª escolha Simples \| Variável + grade Cor/Tamanho | **Feito** ([`SPRINT_PV_S2_PRODUCT_FORM.md`](./SPRINT_PV_S2_PRODUCT_FORM.md)) |
| **Sprint 3** | Import WooCommerce → variantes reais (foto, preço, estoque, SKU) | **Feito** ([`SPRINT_PV_S3_WOO_IMPORT_VARIANTS.md`](./SPRINT_PV_S3_WOO_IMPORT_VARIANTS.md)) |
| **Sprint 4** | Vitrine pública: seletor Cor/Tamanho, foto/preço/estoque da variante | **Feito** ([`SPRINT_PV_S4_STOREFRONT_VARIANTS.md`](./SPRINT_PV_S4_STOREFRONT_VARIANTS.md)) |
| **Sprint 5** | `variant_id` em cart/order + baixa de estoque + hardening | **Feito** ([`SPRINT_PV_S5_CHECKOUT_STOCK.md`](./SPRINT_PV_S5_CHECKOUT_STOCK.md)) |

---

## 1. Meta

Permitir cadastro e venda de produtos no padrão de mercado (WooCommerce / Shopify / Nuvemshop):

1. No **novo cadastro**, a **primeira escolha** é o tipo de estrutura:
   - **Produto simples** — um SKU, um preço, um estoque, galeria única.
   - **Produto variável** — eixos Cor e/ou Tamanho → grade de variantes (cada uma com SKU, preço, estoque, foto).
2. Controle de estoque no **produto** (simples) e em **cada variante** (variável).
3. Import WooCommerce preenche variantes de verdade (não só atributos agregados).
4. Na loja, o cliente escolhe Cor/Tamanho; o checkout reserva/baixa o estoque da variante.

**Não-objetivo desta onda:** terceira dimensão de atributo; WMS; sync contínuo com Woo via API.

---

## 2. Diagnóstico — como está hoje

| Peça | Estado atual | Gap |
|------|--------------|-----|
| Cadastro | `ProductForm`: 1º passo é `type` product\|service (catálogo), não simples\|variável | Falta escolha estrutural |
| Atributos | `variations JSONB` = `[{ name, values }]` | Só eixos; sem SKUs |
| Preço por combinação | `variation_prices` / `pricing_mode` no front | **Não persistem** no backend |
| Estoque | `products.stock_quantity` | Sem estoque por variante |
| Foto por variação | Só `products.images` | CSV WC traz foto na variation — hoje descartada no agregado |
| Import WC (PI S4) | Pai + atributos; `price` = min; variations absorvidas | Sem linhas de variante persistidas |
| Pedido / checkout | `product_id` apenas | Sem `variant_id` → não dá para baixar estoque correto |
| API pública | Sem `variations` / variantes | Vitrine não escolhe combinação |

**Conclusão:** o atalho JSONB (PI13) foi MVP de import; **este plano substitui** essa limitação pelo modelo completo.

---

## 3. UX do cadastro — primeira opção (obrigatório no plano)

### 3.1 Fluxo do formulário (novo item `type=product`)

```
[Novo item]
    │
    ├─ Se loja permite produto e serviço → escolher Produto | Serviço (já existe)
    │
    └─ Se Produto (ou loja só-produtos):
          ┌─────────────────────────────────────────┐
          │  Estrutura do produto  (1ª opção nova)  │
          │                                         │
          │  ○ Produto simples                      │
          │    Um preço, um estoque, uma galeria    │
          │                                         │
          │  ○ Produto variável                     │
          │    Cor e/ou Tamanho → várias combinações│
          └─────────────────────────────────────────┘
                          │
          simples ────────┤──────── variável
                          │
          Dados + preço   │   Dados + eixos (Cor/Tamanho)
          + estoque pai   │   + grade de variantes
          + imagens       │   (SKU, preço, estoque, foto)
```

### 3.2 Regras de UI

| Regra | Detalhe |
|-------|---------|
| **PV-UX1** | Em **criação** de produto, o campo `has_variants` / modo **Simples \| Variável** é o **primeiro bloco** da seção de produto (antes de preço/estoque detalhado). |
| **PV-UX2** | Em **edição**, o modo é visível; troca simples→variável exige gerar ao menos 1 variante; variável→simples só se houver 1 variante ou confirmação de consolidar/apagar variantes. |
| **PV-UX3** | **Serviços** não usam este seletor (permanecem sem variantes nesta onda). |
| **PV-UX4** | Variável: usuário marca eixos **Cor** e/ou **Tamanho** (1 ou 2). Valores editáveis; botão “Gerar combinações”. |
| **PV-UX5** | Grade: cada linha = variante (SKU, preço, promo, estoque, mín., foto, ativo). |
| **PV-UX6** | Simples: esconde grade; mostra estoque/preço/imagens no nível do produto. |

### 3.3 Wireframe textual (bloco 1)

```
Tipo de item (se aplicável):  [Produto] [Serviço]

Estrutura:                    [ Produto simples ]  [ Produto variável ]
                              ↑ selecionado            ↑

Nome, descrição, categoria, imagens do pai…
…demais seções conforme estrutura escolhida
```

---

## 4. Decisões de produto (fechadas — Sprint 0)

Detalhe + inventário + SQL draft: [`SPRINT_PV_S0_INVENTORY_AND_DECISIONS.md`](./SPRINT_PV_S0_INVENTORY_AND_DECISIONS.md).

| ID | Tema | Fechado |
|----|------|---------|
| **PV1** | Persistência | Tabela **`product_variants`** |
| **PV2** | Eixos MVP | Cor e/ou Tamanho (máx. 2) |
| **PV3** | Cache eixos | `products.variations` JSONB espelho |
| **PV4** | Flag | `has_variants` boolean |
| **PV5** | Estoque simples | No pai |
| **PV6** | Estoque variável | Por variante; pai = soma |
| **PV7** | Preço variável | Na variante; pai/listagem = min |
| **PV8** | Foto variante | `product_variants.images` |
| **PV9** | Pedido | `variant_id` FK + snapshot em `selected_variation` JSONB já existente |
| **PV10** | Import WC | 1 variation → 1 row variante |
| **PV11** | SKU | Único por tenant (`tenant_id` na variante — PVA7) |
| **PV12** | 1ª UI | **Simples \| Variável** primeiro bloco do produto |
| **PV13** | Troca modo | Com confirmação (PV-UX2) |
| **PV14** | API pública | Detalhe com variantes ativas |
| **PV15** | Baixa estoque | Checkout exige `variant_id` se variável |
---

## 5. Modelo de dados (draft)

### 5.1 Alterações em `products`

```sql
ALTER TABLE products
  ADD COLUMN has_variants BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN track_inventory BOOLEAN NOT NULL DEFAULT true;
-- stock_quantity: simple = real; variable = soma cache das variantes ativas
```

### 5.2 Tabela `product_variants`

| Campo | Tipo | Uso |
|-------|------|-----|
| `id` | UUID PK | |
| `product_id` | UUID FK → products ON DELETE CASCADE | |
| `sku` | TEXT NULL | |
| `option1_name` | TEXT NOT NULL | ex. `Cor` |
| `option1_value` | TEXT NOT NULL | ex. `Azul` |
| `option2_name` | TEXT NULL | ex. `Tamanho` |
| `option2_value` | TEXT NULL | ex. `M` |
| `price` | DECIMAL | |
| `discount_price` | DECIMAL NULL | |
| `stock_quantity` | INTEGER NOT NULL DEFAULT 0 | |
| `min_stock_quantity` | INTEGER NULL | |
| `images` | JSONB DEFAULT `[]` | URLs |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | |
| `position` | INT NOT NULL DEFAULT 0 | |
| `external_id` | TEXT NULL | ID Woo para reimport |
| `created_at` / `updated_at` | timestamptz | |

**Constraints (propostas)**

- `UNIQUE (product_id, option1_value, COALESCE(option2_value, ''))`
- Índice por `product_id`, `external_id`
- SKU único no tenant (via join `products.user_id` / tenant) — detalhar na S0/S1
- RLS alinhado a `products` (mesmo tenant)

### 5.3 Carrinho e pedido

```sql
ALTER TABLE cart_items  ADD COLUMN variant_id UUID NULL REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN variant_id UUID NULL REFERENCES product_variants(id) ON DELETE SET NULL;
-- opcional: variant_sku TEXT, variant_label TEXT (snapshot)
```

Checkout loja: body passa a exigir `variant_id` quando `has_variants = true`.

### 5.4 Numeração de migration

**S1:** `342_product_variants_pv_s1.sql` (após `341_tenant_custom_domain_default_on.sql`). Inclui `tenant_id` na variante para SKU único (PVA7). Draft completo no closeout S0.

---

## 6. API (contrato alvo)

### Admin (autenticado)

| Método | Rota | Nota |
|--------|------|------|
| `POST /api/products` | Aceita `has_variants` + `variants[]` | Transação: pai + replace/sync variantes |
| `PATCH /api/products/:id` | Idem | Sync variantes (diff por id / external_id) |
| `GET /api/products/:id` | Inclui `variants[]` | |
| `GET /api/products` | Opcional: `variants_count`, `price_min`/`price_max` | |

Payload variante (exemplo):

```json
{
  "sku": "BON-AZUL-M",
  "option1_name": "Cor",
  "option1_value": "Azul",
  "option2_name": "Tamanho",
  "option2_value": "M",
  "price": 69.9,
  "stock_quantity": 3,
  "images": ["https://…"],
  "is_active": true
}
```

### Público

| Método | Nota |
|--------|------|
| Detalhe por slug | Inclui variantes ativas (sem dados internos demais) |
| Lista | Pode omitir variantes; detalhe carrega grade |

### Checkout

`product_id` + `variant_id?` + `quantity` → valida estoque → cria order_item com `variant_id` → decrementa estoque.

---

## 7. Import WooCommerce (evolução do PI)

| Linha WC | Destino |
|----------|---------|
| `simple` | Produto `has_variants=false` (como hoje) |
| `variable` | Produto `has_variants=true` + eixos em `variations` |
| `variation` | **1 row** `product_variants` ( Ascendente → pai ) |

Mapear: preço, promo, estoque, SKU, imagens da variation, `Nome/Valores do atributo 1..2`.

Upsert: por `external_id` (Woo ID) ou SKU no tenant.

**Deprecar** no parser: agregação “só min price + atributos” como único resultado (manter fallback só se zero variations no arquivo).

---

## 8. Estoque — regras

| Situação | Comportamento |
|----------|----------------|
| Simples + `track_inventory` | Usa `products.stock_quantity` |
| Variável + `track_inventory` | Usa `product_variants.stock_quantity`; pai = soma ativas |
| Checkout | Lock row (`FOR UPDATE`); se qty > stock → 409 |
| Estoque 0 | Variante indisponível na vitrine (ou badge esgotado) |
| `track_inventory=false` | Não bloqueia venda (opcional S5) |

Exclusão de produto: CASCADE nas variantes; limpeza de imagens do pai **e** das variantes (estender cleanup atual).

---

## 9. Sprints detalhadas

### Sprint 0 — Inventário e decisões — **Feito** (2026-09-28)

- PV1–PV15 + PVA1–PVA7 fechados; draft SQL 342; fixture JSON.
- Closeout: [`SPRINT_PV_S0_INVENTORY_AND_DECISIONS.md`](./SPRINT_PV_S0_INVENTORY_AND_DECISIONS.md).

### Sprint 1 — Schema + API admin — **Feito** (2026-09-28)

- Migration `342_product_variants_pv_s1.sql` + RLS + API admin com `variants[]`.
- Closeout: [`SPRINT_PV_S1_SCHEMA_AND_API.md`](./SPRINT_PV_S1_SCHEMA_AND_API.md).

### Sprint 2 — ProductForm (Simples \| Variável) — **Feito** (2026-09-28)

- Seletor Simples \| Variável + grade Cor/Tamanho persistida via API S1.
- Closeout: [`SPRINT_PV_S2_PRODUCT_FORM.md`](./SPRINT_PV_S2_PRODUCT_FORM.md).

### Sprint 3 — Import Woo → variantes reais — **Feito** (2026-09-28)

- Parser/executor geram `product_variants` (PV10); upsert por `external_id`/SKU.
- Closeout: [`SPRINT_PV_S3_WOO_IMPORT_VARIANTS.md`](./SPRINT_PV_S3_WOO_IMPORT_VARIANTS.md).

### Sprint 4 — Vitrine pública — **Feito** (2026-09-28)

- Seletor Cor/Tamanho na vitrine; checkout com `variant_id` + preço da variante.
- Closeout: [`SPRINT_PV_S4_STOREFRONT_VARIANTS.md`](./SPRINT_PV_S4_STOREFRONT_VARIANTS.md).

### Sprint 5 — Pedido + estoque + hardening — **Feito** (2026-09-28)

- Baixa atômica (`FOR UPDATE`) no checkout; `track_inventory=false` não bloqueia.
- Sync estoque pai = soma das variantes ativas após baixa.
- Limpeza de mídia ao deletar produto / remover variantes da grade.
- Confirmação ao trocar Simples ↔ Variável no form.
- Closeout: [`SPRINT_PV_S5_CHECKOUT_STOCK.md`](./SPRINT_PV_S5_CHECKOUT_STOCK.md).

---

## 10. Critério de pronto do plano (fim Sprint 5)

- [x] Cadastro novo: **1ª opção** Simples \| Variável
- [x] Variável: Cor e/ou Tamanho, grade com SKU/preço/estoque/foto
- [x] Estoque no pai (simples) e na variante (variável)
- [x] Import WC gera variantes reais
- [x] Vitrine seleciona combinação e mostra foto/preço corretos
- [x] Checkout/pedido com `variant_id` e baixa de estoque
- [x] Sem depender de `variation_prices` fantasma no front

---

## 11. Ordem de kickoff

1. ~~`ok sprint 0`~~ — decisões + schema draft ✅  
2. ~~`ok sprint 1`~~ — DB + API ✅  
3. ~~`ok sprint 2`~~ — Form com seletor Simples/Variável ✅  
4. ~~`ok sprint 3`~~ — Import WC ✅  
5. ~~`ok sprint 4`~~ — Vitrine ✅  
6. ~~`ok sprint 5`~~ — Checkout/estoque ✅  

---

## 12. Referências

- Form atual: `src/pages/ProductForm.tsx`
- API: `packages/backend/src/controllers/productsController.ts`
- Schema base: `database/init/06_create_products.sql`
- Import: `src/utils/importWooProductsCsv.ts` · [`PLANO_IMPORTACAO_PRODUTOS_WOOCOMMERCE.md`](./PLANO_IMPORTACAO_PRODUTOS_WOOCOMMERCE.md)
- Checkout: `packages/backend/src/controllers/storeCheckoutController.ts` · `storePublicCheckoutService.ts`
- Estoque: `packages/backend/src/services/productInventoryService.ts`
- Evolução catálogo: [`PLANO_EVOLUCAO_MODULO_CATALOGO.md`](./PLANO_EVOLUCAO_MODULO_CATALOGO.md)
