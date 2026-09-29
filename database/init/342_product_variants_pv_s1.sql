-- PV Sprint 1 — product_variants + flags no pai + variant_id em cart/order + RLS

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS has_variants BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.products.has_variants IS
  'false = produto simples; true = grade em product_variants';
COMMENT ON COLUMN public.products.track_inventory IS
  'Se false, checkout não bloqueia por estoque (PV S5)';

CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
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
  CONSTRAINT product_variants_option2_pair_chk CHECK (
    (option2_name IS NULL AND option2_value IS NULL)
    OR (option2_name IS NOT NULL AND option2_value IS NOT NULL)
  )
);

-- Combinação única por produto (option2 NULL tratado como '')
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_variants_product_combo
  ON public.product_variants (product_id, option1_value, (COALESCE(option2_value, '')));

-- SKU único por tenant quando preenchido (PVA7 / PV11)
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_variants_tenant_sku
  ON public.product_variants (tenant_id, sku)
  WHERE sku IS NOT NULL AND btrim(sku) <> '';

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id
  ON public.product_variants (product_id);

CREATE INDEX IF NOT EXISTS idx_product_variants_tenant_id
  ON public.product_variants (tenant_id);

CREATE INDEX IF NOT EXISTS idx_product_variants_external_id
  ON public.product_variants (external_id)
  WHERE external_id IS NOT NULL;

DROP TRIGGER IF EXISTS product_variants_updated_at ON public.product_variants;
CREATE TRIGGER product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cart_items_variant_id
  ON public.cart_items (variant_id)
  WHERE variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_variant_id
  ON public.order_items (variant_id)
  WHERE variant_id IS NOT NULL;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_variants_tenant_policy ON public.product_variants;
CREATE POLICY product_variants_tenant_policy ON public.product_variants
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

COMMENT ON TABLE public.product_variants IS
  'PV: variantes de produto (Cor/Tamanho); estoque e preço por combinação.';
