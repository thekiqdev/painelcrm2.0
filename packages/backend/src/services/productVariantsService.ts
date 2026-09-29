/**
 * PV Sprint 1 — sync de product_variants + agregados no produto pai.
 */

import type { PoolClient, QueryResultRow } from 'pg';

export const PRODUCT_VARIANT_AXIS_ALIASES: Record<string, 'Cor' | 'Tamanho'> = {
  cor: 'Cor',
  color: 'Cor',
  colour: 'Cor',
  tamanho: 'Tamanho',
  size: 'Tamanho',
};

export type ProductVariantInput = {
  id?: string;
  sku?: string | null;
  option1_name: string;
  option1_value: string;
  option2_name?: string | null;
  option2_value?: string | null;
  price?: number | null;
  discount_price?: number | null;
  stock_quantity?: number | null;
  min_stock_quantity?: number | null;
  images?: unknown[];
  is_active?: boolean;
  position?: number;
  external_id?: string | null;
};

export type ProductVariantRow = {
  id: string;
  product_id: string;
  tenant_id: string;
  sku: string | null;
  option1_name: string;
  option1_value: string;
  option2_name: string | null;
  option2_value: string | null;
  price: string | number | null;
  discount_price: string | number | null;
  stock_quantity: number;
  min_stock_quantity: number | null;
  images: unknown;
  is_active: boolean;
  position: number;
  external_id: string | null;
  created_at?: string;
  updated_at?: string;
};

export class ProductVariantsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductVariantsValidationError';
  }
}

export function normalizeVariantAxisName(raw: string): 'Cor' | 'Tamanho' {
  const key = raw.trim().toLowerCase();
  const mapped = PRODUCT_VARIANT_AXIS_ALIASES[key];
  if (!mapped) {
    throw new ProductVariantsValidationError(
      `Eixo de variação inválido: "${raw}". Use Cor ou Tamanho (aliases: Color, Size).`
    );
  }
  return mapped;
}

export function normalizeVariantInput(input: ProductVariantInput): ProductVariantInput {
  const option1_name = normalizeVariantAxisName(input.option1_name);
  const option1_value = String(input.option1_value ?? '').trim();
  if (!option1_value) {
    throw new ProductVariantsValidationError('option1_value é obrigatório');
  }

  const hasOpt2Name = input.option2_name != null && String(input.option2_name).trim() !== '';
  const hasOpt2Value = input.option2_value != null && String(input.option2_value).trim() !== '';
  if (hasOpt2Name !== hasOpt2Value) {
    throw new ProductVariantsValidationError(
      'option2_name e option2_value devem ser ambos preenchidos ou ambos vazios'
    );
  }

  let option2_name: string | null = null;
  let option2_value: string | null = null;
  if (hasOpt2Name && hasOpt2Value) {
    option2_name = normalizeVariantAxisName(String(input.option2_name));
    option2_value = String(input.option2_value).trim();
    if (option2_name === option1_name) {
      throw new ProductVariantsValidationError('Os dois eixos devem ser distintos (Cor e Tamanho)');
    }
  }

  const sku =
    input.sku == null || String(input.sku).trim() === '' ? null : String(input.sku).trim();

  return {
    ...input,
    sku,
    option1_name,
    option1_value,
    option2_name,
    option2_value,
    stock_quantity: input.stock_quantity == null ? 0 : Number(input.stock_quantity),
    is_active: input.is_active !== false,
    position: input.position == null ? 0 : Number(input.position),
    images: Array.isArray(input.images) ? input.images : [],
    external_id:
      input.external_id == null || String(input.external_id).trim() === ''
        ? null
        : String(input.external_id).trim(),
  };
}

/** Soma estoque e preço mínimo das variantes ativas (cache do pai). */
export function aggregateParentFromVariants(variants: ProductVariantInput[]): {
  stock_quantity: number;
  price: number | null;
} {
  const active = variants.filter((v) => v.is_active !== false);
  const stock_quantity = active.reduce((sum, v) => sum + (Number(v.stock_quantity) || 0), 0);
  const prices = active
    .map((v) => (v.price == null || Number.isNaN(Number(v.price)) ? null : Number(v.price)))
    .filter((p): p is number => p != null);
  const price = prices.length > 0 ? Math.min(...prices) : null;
  return { stock_quantity, price };
}

export function formatVariantRow(row: ProductVariantRow) {
  return {
    id: row.id,
    product_id: row.product_id,
    tenant_id: row.tenant_id,
    sku: row.sku,
    option1_name: row.option1_name,
    option1_value: row.option1_value,
    option2_name: row.option2_name,
    option2_value: row.option2_value,
    price: row.price != null ? parseFloat(String(row.price)) : null,
    discount_price: row.discount_price != null ? parseFloat(String(row.discount_price)) : null,
    stock_quantity: Number(row.stock_quantity) || 0,
    min_stock_quantity: row.min_stock_quantity != null ? Number(row.min_stock_quantity) : null,
    images: Array.isArray(row.images) ? row.images : [],
    is_active: Boolean(row.is_active),
    position: Number(row.position) || 0,
    external_id: row.external_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listVariantsForProduct(
  client: PoolClient,
  productId: string
): Promise<ReturnType<typeof formatVariantRow>[]> {
  const result = await client.query<ProductVariantRow>(
    `SELECT * FROM product_variants
     WHERE product_id = $1
     ORDER BY position ASC, created_at ASC`,
    [productId]
  );
  return result.rows.map(formatVariantRow);
}

export async function listVariantsForProducts(
  client: PoolClient,
  productIds: string[]
): Promise<Map<string, ReturnType<typeof formatVariantRow>[]>> {
  const map = new Map<string, ReturnType<typeof formatVariantRow>[]>();
  if (productIds.length === 0) return map;
  const result = await client.query<ProductVariantRow>(
    `SELECT * FROM product_variants
     WHERE product_id = ANY($1::uuid[])
     ORDER BY position ASC, created_at ASC`,
    [productIds]
  );
  for (const row of result.rows) {
    const list = map.get(row.product_id) ?? [];
    list.push(formatVariantRow(row));
    map.set(row.product_id, list);
  }
  return map;
}

export type SyncProductVariantsResult = {
  variants: ReturnType<typeof formatVariantRow>[];
  /** URLs de imagens das variantes removidas (cleanup pós-commit). */
  deletedImageUrls: string[];
};

/**
 * Replace-sync: payload é a lista autoritativa.
 * Match: id → external_id → insert. Rows do produto ausentes no payload são apagadas.
 */
export async function syncProductVariants(params: {
  client: PoolClient;
  productId: string;
  tenantId: string;
  variants: ProductVariantInput[];
}): Promise<SyncProductVariantsResult> {
  const { client, productId, tenantId } = params;
  const normalized = params.variants.map(normalizeVariantInput);

  if (normalized.length === 0) {
    throw new ProductVariantsValidationError(
      'Produto variável exige ao menos uma variante em variants[]'
    );
  }

  const existing = await client.query<ProductVariantRow>(
    `SELECT * FROM product_variants WHERE product_id = $1`,
    [productId]
  );
  const byId = new Map(existing.rows.map((r) => [r.id, r]));
  const byExternal = new Map(
    existing.rows
      .filter((r) => r.external_id)
      .map((r) => [r.external_id as string, r])
  );

  const keptIds = new Set<string>();

  for (let i = 0; i < normalized.length; i++) {
    const v = normalized[i];
    const position = v.position != null ? Number(v.position) : i;
    let match: ProductVariantRow | undefined;
    if (v.id && byId.has(v.id)) {
      match = byId.get(v.id);
    } else if (v.external_id && byExternal.has(v.external_id)) {
      match = byExternal.get(v.external_id);
    }

    const imagesJson = JSON.stringify(v.images ?? []);

    if (match) {
      keptIds.add(match.id);
      await client.query(
        `UPDATE product_variants SET
           sku = $1,
           option1_name = $2,
           option1_value = $3,
           option2_name = $4,
           option2_value = $5,
           price = $6,
           discount_price = $7,
           stock_quantity = $8,
           min_stock_quantity = $9,
           images = $10::jsonb,
           is_active = $11,
           position = $12,
           external_id = $13,
           updated_at = now()
         WHERE id = $14 AND product_id = $15`,
        [
          v.sku,
          v.option1_name,
          v.option1_value,
          v.option2_name,
          v.option2_value,
          v.price ?? null,
          v.discount_price ?? null,
          v.stock_quantity ?? 0,
          v.min_stock_quantity ?? null,
          imagesJson,
          v.is_active !== false,
          position,
          v.external_id,
          match.id,
          productId,
        ]
      );
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO product_variants (
           product_id, tenant_id, sku, option1_name, option1_value,
           option2_name, option2_value, price, discount_price,
           stock_quantity, min_stock_quantity, images, is_active, position, external_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15
         ) RETURNING id`,
        [
          productId,
          tenantId,
          v.sku,
          v.option1_name,
          v.option1_value,
          v.option2_name,
          v.option2_value,
          v.price ?? null,
          v.discount_price ?? null,
          v.stock_quantity ?? 0,
          v.min_stock_quantity ?? null,
          imagesJson,
          v.is_active !== false,
          position,
          v.external_id,
        ]
      );
      keptIds.add(inserted.rows[0].id);
    }
  }

  const removedRows = existing.rows.filter((r) => !keptIds.has(r.id));
  if (removedRows.length > 0) {
    await client.query(`DELETE FROM product_variants WHERE id = ANY($1::uuid[])`, [
      removedRows.map((r) => r.id),
    ]);
  }

  return {
    variants: await listVariantsForProduct(client, productId),
    deletedImageUrls: collectVariantImageUrls(removedRows),
  };
}

export async function deleteAllVariantsForProduct(
  client: PoolClient,
  productId: string
): Promise<ProductVariantRow[]> {
  const existing = await client.query<ProductVariantRow>(
    `SELECT * FROM product_variants WHERE product_id = $1`,
    [productId]
  );
  if (existing.rows.length > 0) {
    await client.query(`DELETE FROM product_variants WHERE product_id = $1`, [productId]);
  }
  return existing.rows;
}

export async function applyParentAggregates(
  client: PoolClient,
  productId: string,
  variants: ProductVariantInput[]
): Promise<void> {
  const { stock_quantity, price } = aggregateParentFromVariants(variants);
  await client.query(
    `UPDATE products SET stock_quantity = $1, price = COALESCE($2, price), updated_at = now()
     WHERE id = $3`,
    [stock_quantity, price, productId]
  );
}

/** Coleta URLs de imagens das variantes (para cleanup no delete do produto). */
export function collectVariantImageUrls(rows: Array<{ images?: unknown }>): string[] {
  const urls: string[] = [];
  for (const row of rows) {
    if (!Array.isArray(row.images)) continue;
    for (const u of row.images) {
      if (typeof u === 'string' && u.trim()) urls.push(u.trim());
    }
  }
  return urls;
}

export function isUniqueViolation(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === '23505'
  );
}

export function uniqueViolationMessage(err: unknown): string {
  const detail =
    err && typeof err === 'object' && 'detail' in err
      ? String((err as { detail?: string }).detail ?? '')
      : '';
  if (/sku/i.test(detail) || /uq_product_variants_tenant_sku/i.test(detail)) {
    return 'SKU de variante já existe neste tenant';
  }
  if (/combo|option/i.test(detail) || /uq_product_variants_product_combo/i.test(detail)) {
    return 'Combinação de opções duplicada na grade';
  }
  return 'Violação de unicidade nas variantes';
}

/** Tipagem auxiliar para queries genéricas. */
export type DbClient = PoolClient;

export async function queryOne<T extends QueryResultRow>(
  client: PoolClient,
  sql: string,
  params: unknown[]
): Promise<T | null> {
  const r = await client.query<T>(sql, params);
  return r.rows[0] ?? null;
}
