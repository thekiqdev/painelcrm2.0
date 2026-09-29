# PV Sprint 0 — Inventário + decisões + draft schema

| Campo | Valor |
|-------|-------|
| **Data** | 2026-09-28 |
| **Sprint** | **S0** (feito) |
| **Plano-mãe** | [`PLANO_VARIANTES_PRODUTO.md`](./PLANO_VARIANTES_PRODUTO.md) |
| **Próximo** | **S2** — ProductForm Simples \| Variável (S1 feito: [`SPRINT_PV_S1_SCHEMA_AND_API.md`](./SPRINT_PV_S1_SCHEMA_AND_API.md)) |

---

## Entregas

1. Decisões **PV1–PV15** + complementares **PVA1–PVA6** fechadas.
2. Inventário das superfícies atuais (abaixo).
3. Draft SQL alvo (seção 4) — implementação na **S1** como `342_product_variants_pv_s1.sql`.
4. Fixture de contrato: [`src/utils/__fixtures__/product-variants-sample.json`](../../src/utils/__fixtures__/product-variants-sample.json).

---

## Decisões fechadas (ADR curto)

| ID | Decisão |
|----|---------|
| **PV1** | Persistência = tabela **`product_variants`** (não só JSONB de preços) |
| **PV2** | Máx. **2 eixos** no MVP: **Cor** e/ou **Tamanho** (aliases EN: Color/Size) |
| **PV3** | `products.variations` JSONB permanece como **espelho dos eixos** para UI/import |
| **PV4** | `products.has_variants BOOLEAN NOT NULL DEFAULT false` |
| **PV5** | Simples: estoque em `products.stock_quantity` |
| **PV6** | Variável: estoque em cada variante; pai = **soma** das `is_active` (cache atualizado no write) |
| **PV7** | Preço na variante; listagem/pai podem expor `price_min` / guardar `products.price` = min |
| **PV8** | Fotos da variante em `product_variants.images` JSONB; vitrine: variante → fallback pai |
| **PV9** | Pedido/carrinho: coluna **`variant_id UUID NULL` FK**; snapshot textual em `selected_variation` JSONB já existente (sku, label, options) |
| **PV10** | Import WC: cada `variation` → 1 row `product_variants` (substitui achatamento PI13) |
| **PV11** | SKU único por tenant quando preenchido (simple no pai; variable na variante) |
| **PV12** | **1ª UI do produto:** seletor **Produto simples \| Produto variável** (antes de preço/grade) |
| **PV13** | Troca de modo com confirmação (regras PV-UX2 do plano-mãe) |
| **PV14** | API pública de **detalhe** expõe variantes ativas |
| **PV15** | Checkout: se `has_variants`, exige `variant_id`; baixa estoque atômica; falha se insuficiente |

### Complementares (S0)

| ID | Tema | Fechado |
|----|------|---------|
| **PVA1** | Migration number | **`342_product_variants_pv_s1.sql`** (após `341_tenant_custom_domain_default_on.sql`) |
| **PVA2** | `selected_variation` JSONB | **Manter** como snapshot no item (já em `06_create_products.sql`); popular no checkout com `{ variant_id, sku, label, options }` |
| **PVA3** | `track_inventory` | Coluna no pai; default `true`. Se `false`, não bloqueia venda (S5) |
| **PVA4** | Serviços | Sem variantes nesta onda |
| **PVA5** | Delete produto | CASCADE variantes + limpar imagens do pai **e** das variantes |
| **PVA6** | Eixo “Peso” no form atual | Fora do MVP de eixos padrão; valores custom só se mapeados depois — UI S2 foca Cor/Tamanho |

---

## Inventário — estado atual

| # | Área | Path | Fato |
|---|------|------|------|
| 1 | Form | `src/pages/ProductForm.tsx` | 1º passo hoje: Produto\|Serviço. Variações = eixos + `pricing_mode` / `variation_prices` **só no front** |
| 2 | Types | `src/types/products.ts` | `ProductVariation`, `VariationPrice`; sem entidade Variant persistida |
| 3 | API | `productsController.ts` | Zod/INSERT sem `pricing_mode`/`variation_prices`; `variations` JSONB ok; público **sem** variations |
| 4 | Checkout | `storeCheckoutController` + `storePublicCheckoutService` | Só `product_id`; `selected_variation = NULL`; **sem** checagem de estoque |
| 5 | Schema itens | `06_create_products.sql` | `cart_items` / `order_items` já têm **`selected_variation JSONB`**; falta `variant_id` |
| 6 | Import WC | `importWooProductsCsv.ts` | PI13: min price + eixos; variations absorvidas — **sem** rows por SKU |
| 7 | Media delete | `productCatalogMediaCleanup.ts` | Só `images` + `secondary_images` do pai |
| 8 | RLS | `57_rls_tenant_isolation.sql` | `products` (+ cart/order via join). Novas policies para `product_variants` na S1 |
| 9 | Migrations | `migrationOrder.ts` | Última numerada: **`341_…`** → próxima **`342_…`** |

### Gaps que a onda PV fecha

| Gap | Ação |
|-----|------|
| Preços por combinação não persistem | → `product_variants.price` |
| Sem estoque por combinação | → `product_variants.stock_quantity` |
| Sem foto por combinação | → `product_variants.images` |
| Checkout sem variante | → `variant_id` + snapshot |
| UI sem Simples/Variável | → Sprint 2 (PV12) |
| Import achatado | → Sprint 3 (PV10) |

---

## Draft SQL (alvo Sprint 1)

```sql
-- 342_product_variants_pv_s1.sql (DRAFT — implementar na S1)

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS has_variants BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.products.has_variants IS 'false = produto simples; true = grade em product_variants';
COMMENT ON COLUMN public.products.track_inventory IS 'Se false, checkout não bloqueia por estoque (S5)';

CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku TEXT,
  option1_name TEXT NOT NULL,
  option1_value TEXT NOT NULL,
  option2_name TEXT,
  option2_value TEXT,
  price DECIMAL(10,2),
  discount_price DECIMAL(10,2),
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  min_stock_quantity INTEGER,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_variants_combo_unique
    UNIQUE (product_id, option1_value, option2_value)
);

-- Nota S1: UNIQUE com NULL em option2_value — validar comportamento PG / usar COALESCE em índice único parcial se necessário.

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_external_id ON public.product_variants(external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL;

-- RLS: ENABLE + policy por tenant via products.user_id → users.tenant_id (espelhar 57_…)
```

**SKU único por tenant:** índice único parcial via join não é trivial em PG sem coluna `tenant_id` denormalizada — **S1:** validar unicidade na API (query) **ou** adicionar `tenant_id` em `product_variants` espelhando o do produto. **Fechado PVA7:** na S1 preferir **`tenant_id UUID NOT NULL`** na variante (preenchido no insert a partir do owner) + `UNIQUE NULLS NOT DISTINCT (tenant_id, sku) WHERE sku IS NOT NULL AND sku <> ''` (PG 15+) ou índice único parcial clássico.

---

## Fixture de contrato

Arquivo: `src/utils/__fixtures__/product-variants-sample.json`

- 1 produto **simple** (has_variants=false, stock no pai).
- 1 produto **variable** (Cor + Tamanho) com 4 variantes (2×2), cada uma com sku/price/stock/images.

Usar como referência de payload API (S1) e testes de import (S3).

---

## Critério de aceite S0

- [x] PV1–PV15 + PVA1–PVA7 fechados
- [x] Inventário documentado
- [x] Draft SQL 342
- [x] Fixture JSON no repo
- [x] Plano-mãe: Sprint 0 = Feito; kickoff S1

---

## Próximo kickoff

Em chat: **`ok sprint 1`** — migration real + API admin com `variants[]`.
