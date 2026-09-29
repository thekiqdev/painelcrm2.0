import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { assertModulePermission, ModulePermissionError } from '../permissions/index.js';
import {
  joinUserTenant,
  joinUserTenantByUserId,
  whereUserInTenantFromUserId,
  getTenantIdOrNull,
  ensureUserIdForInsert,
} from '../utils/tenantScope.js';
import { z } from 'zod';
import { unlinkStoredProductImageUrls } from '../services/productCatalogMediaCleanup.js';
import {
  ProductVariantsValidationError,
  applyParentAggregates,
  collectVariantImageUrls,
  deleteAllVariantsForProduct,
  isUniqueViolation,
  listVariantsForProduct,
  listVariantsForProducts,
  syncProductVariants,
  uniqueViolationMessage,
  type ProductVariantInput,
} from '../services/productVariantsService.js';

/** V2-1 + PV S4: campos públicos; variantes só no detalhe. */
const PUBLIC_PRODUCT_SELECT = `
  p.id, p.name, p.type, p.short_description, p.description, p.price, p.discount_price, p.currency,
  p.category, p.images, p.features, p.secondary_images, p.duration_hours, p.is_recurring, p.recurrence_interval,
  p.has_variants, p.track_inventory, p.stock_quantity
` as const;

function parseJsonArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return [];
}

function toPublicVariantDto(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    sku: row.sku != null ? String(row.sku) : null,
    option1_name: String(row.option1_name),
    option1_value: String(row.option1_value),
    option2_name: row.option2_name != null ? String(row.option2_name) : null,
    option2_value: row.option2_value != null ? String(row.option2_value) : null,
    price: row.price != null ? parseFloat(String(row.price)) : null,
    discount_price: row.discount_price != null ? parseFloat(String(row.discount_price)) : null,
    stock_quantity: Number(row.stock_quantity) || 0,
    images: parseJsonArray<string>(row.images),
    is_active: row.is_active !== false,
    position: Number(row.position) || 0,
  };
}

function toPublicProductDto(
  row: Record<string, unknown>,
  extras?: { variants?: ReturnType<typeof toPublicVariantDto>[]; price_max?: number | null }
) {
  return {
    id: String(row.id),
    name: String(row.name),
    type: row.type as 'product' | 'service',
    short_description: row.short_description != null ? String(row.short_description) : undefined,
    description: row.description != null ? String(row.description) : undefined,
    price: row.price != null ? parseFloat(String(row.price)) : null,
    discount_price: row.discount_price != null ? parseFloat(String(row.discount_price)) : null,
    currency: String(row.currency ?? 'BRL'),
    category: row.category != null ? String(row.category) : null,
    images: parseJsonArray<string>(row.images),
    secondary_images: parseJsonArray<string>(row.secondary_images),
    features: parseJsonArray<string>(row.features),
    duration_hours: row.duration_hours != null ? Number(row.duration_hours) : null,
    is_recurring: row.is_recurring != null ? Boolean(row.is_recurring) : null,
    recurrence_interval: row.recurrence_interval != null ? String(row.recurrence_interval) : null,
    has_variants: Boolean(row.has_variants),
    track_inventory: row.track_inventory == null ? true : Boolean(row.track_inventory),
    stock_quantity: row.stock_quantity != null ? Number(row.stock_quantity) : null,
    price_max: extras?.price_max ?? null,
    variants: extras?.variants,
  };
}

/** JSON do front pode enviar null (Postgres) ou NaN (parseFloat inválido); Zod .optional() não aceita null. */
const emptyNullToUndef = (v: unknown) => (v === '' || v === null ? undefined : v);

const optionalNumber = z.preprocess((v) => {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'number' && Number.isNaN(v)) return undefined;
  return v;
}, z.number().optional());

const optionalUuid = z.preprocess(
  emptyNullToUndef,
  z.string().uuid().optional()
);

const optionalRecurrence = z.preprocess(
  emptyNullToUndef,
  z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional()
);

const variantSchema = z.object({
  id: z.preprocess(emptyNullToUndef, z.string().uuid().optional()),
  sku: z.preprocess(emptyNullToUndef, z.string().optional()),
  option1_name: z.string().min(1),
  option1_value: z.string().min(1),
  option2_name: z.preprocess(emptyNullToUndef, z.string().optional()),
  option2_value: z.preprocess(emptyNullToUndef, z.string().optional()),
  price: optionalNumber,
  discount_price: optionalNumber,
  stock_quantity: optionalNumber,
  min_stock_quantity: optionalNumber,
  images: z.array(z.any()).default([]),
  is_active: z.boolean().optional(),
  position: optionalNumber,
  external_id: z.preprocess(emptyNullToUndef, z.string().optional()),
});

const productSchema = z.object({
  name: z.string().min(1),
  description: z.preprocess(emptyNullToUndef, z.string().optional()),
  type: z.enum(['product', 'service']),
  price: optionalNumber,
  currency: z.string().default('BRL'),
  images: z.array(z.any()).default([]),
  features: z.array(z.any()).default([]),
  category: z.preprocess(emptyNullToUndef, z.string().optional()),
  status: z.enum(['active', 'inactive', 'draft']).default('active'),
  is_public: z.boolean().default(true),
  duration_hours: optionalNumber,
  cost: optionalNumber,
  sku: z.preprocess(emptyNullToUndef, z.string().optional()),
  stock_quantity: optionalNumber,
  min_stock_quantity: optionalNumber,
  responsible_id: optionalUuid,
  short_description: z.preprocess(emptyNullToUndef, z.string().optional()),
  discount_price: optionalNumber,
  secondary_images: z.array(z.any()).default([]),
  variations: z.array(z.any()).default([]),
  contract_template: z.preprocess(emptyNullToUndef, z.string().optional()),
  has_contract: z.boolean().default(false),
  is_recurring: z.boolean().default(false),
  recurrence_interval: optionalRecurrence,
  has_variants: z.boolean().default(false),
  track_inventory: z.boolean().default(true),
  variants: z.array(variantSchema).optional(),
  external_id: z.preprocess(emptyNullToUndef, z.string().optional()),
});

function formatProductRow(
  product: Record<string, unknown>,
  variants: unknown[] = []
) {
  return {
    ...product,
    price: product.price != null ? parseFloat(String(product.price)) : null,
    discount_price: product.discount_price != null ? parseFloat(String(product.discount_price)) : null,
    cost: product.cost != null ? parseFloat(String(product.cost)) : null,
    has_variants: Boolean(product.has_variants),
    track_inventory: product.track_inventory == null ? true : Boolean(product.track_inventory),
    variants,
  };
}

function assertProductVariantRules(params: {
  type: 'product' | 'service';
  has_variants: boolean;
  variants: ProductVariantInput[] | undefined;
  requireVariantsWhenVariable?: boolean;
}): void {
  if (params.type === 'service' && params.has_variants) {
    throw new ProductVariantsValidationError('Serviços não suportam variantes nesta versão');
  }
  if (
    params.has_variants &&
    params.requireVariantsWhenVariable !== false &&
    (!params.variants || params.variants.length === 0)
  ) {
    throw new ProductVariantsValidationError(
      'Produto variável exige variants[] com ao menos uma combinação'
    );
  }
  if (!params.has_variants && params.variants && params.variants.length > 0) {
    throw new ProductVariantsValidationError(
      'variants[] só é permitido quando has_variants=true'
    );
  }
}

export async function getProducts(req: AuthRequest, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdOrNull(req.tenantId);
    if (!tenantId) {
      res.json([]);
      return;
    }
    const userId = req.userId!;
    await assertModulePermission(userId, 'products', 'view', undefined, req);

    const result = await pool.query(
      `SELECT p.*,
          (SELECT COUNT(*)::int FROM product_variants pv WHERE pv.product_id = p.id) AS variants_count
       FROM products p
       ${joinUserTenant('p', 'user_id', 1)}
       ORDER BY p.created_at DESC`,
      [tenantId]
    );

    const products = result.rows.map((product) => ({
      ...formatProductRow(product, []),
      variants_count: Number(product.variants_count) || 0,
    }));

    res.json(products);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getProductById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT p.* FROM products p
       ${joinUserTenantByUserId('p', 'user_id', 2)}
       WHERE p.id = $1`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    await assertModulePermission(userId, 'products', 'view', undefined, req);

    const client = await pool.connect();
    try {
      const variants = await listVariantsForProduct(client, id);
      res.json(formatProductRow(result.rows[0], variants));
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createProduct(req: AuthRequest, res: Response): Promise<void> {
  const client = await pool.connect();
  try {
    const userId = ensureUserIdForInsert(req);
    const productData = productSchema.parse(req.body);

    await assertModulePermission(userId, 'products', 'create', undefined, req);

    assertProductVariantRules({
      type: productData.type,
      has_variants: productData.has_variants,
      variants: productData.variants as ProductVariantInput[] | undefined,
    });

    const tenantRes = await client.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM users WHERE id = $1`,
      [userId]
    );
    const tenantId = tenantRes.rows[0]?.tenant_id;
    if (!tenantId) {
      res.status(400).json({ error: 'Usuário sem tenant' });
      return;
    }

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO products (
        user_id, name, description, type, price, currency, images, features,
        category, status, is_public, duration_hours, cost, sku, stock_quantity,
        min_stock_quantity, responsible_id, short_description, discount_price,
        secondary_images, variations, contract_template, has_contract,
        is_recurring, recurrence_interval, has_variants, track_inventory, external_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
      ) RETURNING *`,
      [
        userId, productData.name, productData.description, productData.type,
        productData.price, productData.currency, JSON.stringify(productData.images),
        JSON.stringify(productData.features), productData.category, productData.status,
        productData.is_public, productData.duration_hours, productData.cost,
        productData.sku, productData.stock_quantity, productData.min_stock_quantity,
        productData.responsible_id, productData.short_description, productData.discount_price,
        JSON.stringify(productData.secondary_images), JSON.stringify(productData.variations),
        productData.contract_template, productData.has_contract, productData.is_recurring,
        productData.recurrence_interval, productData.has_variants, productData.track_inventory,
        productData.external_id ?? null,
      ]
    );

    const product = result.rows[0];
    let variants: Awaited<ReturnType<typeof listVariantsForProduct>> = [];

    if (productData.has_variants) {
      const synced = await syncProductVariants({
        client,
        productId: product.id,
        tenantId,
        variants: productData.variants as ProductVariantInput[],
      });
      variants = synced.variants;
      await applyParentAggregates(client, product.id, variants);
      const refreshed = await client.query(`SELECT * FROM products WHERE id = $1`, [product.id]);
      await client.query('COMMIT');
      res.status(201).json(formatProductRow(refreshed.rows[0], variants));
      return;
    }

    await client.query('COMMIT');
    res.status(201).json(formatProductRow(product, variants));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof ProductVariantsValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message === 'Authentication required') {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: uniqueViolationMessage(error) });
      return;
    }
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

export async function updateProduct(req: AuthRequest, res: Response): Promise<void> {
  const client = await pool.connect();
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const productData = productSchema.partial().parse(req.body);

    const existing = await client.query<{
      user_id: string;
      responsible_id: string | null;
      has_variants: boolean;
      type: 'product' | 'service';
    }>(
      `SELECT user_id, responsible_id, has_variants, type FROM products p
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE p.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    const row = existing.rows[0];
    await assertModulePermission(userId, 'products', 'edit', {
      ownerId: row.user_id,
      assigneeId: row.responsible_id,
    }, req);

    const nextHasVariants =
      productData.has_variants !== undefined ? productData.has_variants : Boolean(row.has_variants);
    const nextType = productData.type ?? row.type;
    const variantsProvided = productData.variants !== undefined;

    assertProductVariantRules({
      type: nextType,
      has_variants: nextHasVariants,
      variants: productData.variants as ProductVariantInput[] | undefined,
      requireVariantsWhenVariable: variantsProvided || productData.has_variants === true,
    });

    const tenantRes = await client.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM users WHERE id = $1`,
      [row.user_id]
    );
    const tenantId = tenantRes.rows[0]?.tenant_id;
    if (!tenantId) {
      res.status(400).json({ error: 'Usuário sem tenant' });
      return;
    }

    await client.query('BEGIN');

    const { variants: _variants, ...productFields } = productData;
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    Object.entries(productFields).forEach(([key, value]) => {
      if (value !== undefined) {
        if (['images', 'features', 'secondary_images', 'variations'].includes(key)) {
          updates.push(`${key} = $${paramIndex}`);
          values.push(JSON.stringify(value));
        } else {
          updates.push(`${key} = $${paramIndex}`);
          values.push(value);
        }
        paramIndex++;
      }
    });

    if (updates.length === 0 && !variantsProvided && productData.has_variants === undefined) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    let product = existing.rows[0] as Record<string, unknown>;
    if (updates.length > 0) {
      values.push(id, userId);
      const result = await client.query(
        `UPDATE products 
         SET ${updates.join(', ')}, updated_at = now()
         WHERE id = $${paramIndex} AND ${whereUserInTenantFromUserId('user_id', paramIndex + 1)}
         RETURNING *`,
        values
      );
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Product not found' });
        return;
      }
      product = result.rows[0];
    } else {
      const refreshed = await client.query(`SELECT * FROM products WHERE id = $1`, [id]);
      product = refreshed.rows[0];
    }

    let variants: Awaited<ReturnType<typeof listVariantsForProduct>> = [];
    let orphanVariantImageUrls: string[] = [];

    if (!nextHasVariants) {
      const deleted = await deleteAllVariantsForProduct(client, id);
      orphanVariantImageUrls = collectVariantImageUrls(deleted);
      variants = [];
    } else if (variantsProvided) {
      if (productData.has_variants !== true && !Boolean(product.has_variants)) {
        await client.query(
          `UPDATE products SET has_variants = true, updated_at = now() WHERE id = $1`,
          [id]
        );
      }
      const synced = await syncProductVariants({
        client,
        productId: id,
        tenantId,
        variants: productData.variants as ProductVariantInput[],
      });
      variants = synced.variants;
      orphanVariantImageUrls = synced.deletedImageUrls;
      await applyParentAggregates(client, id, variants);
      const refreshed = await client.query(`SELECT * FROM products WHERE id = $1`, [id]);
      product = refreshed.rows[0];
    } else {
      variants = await listVariantsForProduct(client, id);
    }

    await client.query('COMMIT');

    if (orphanVariantImageUrls.length > 0) {
      try {
        await unlinkStoredProductImageUrls({
          images: orphanVariantImageUrls,
          tenantId,
          ownerUserId: row.user_id,
        });
      } catch (cleanupErr) {
        console.warn('[updateProduct] limpeza de mídia de variantes falhou', {
          productId: id,
          message: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
        });
      }
    }

    res.json(formatProductRow(product, variants));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof ProductVariantsValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: uniqueViolationMessage(error) });
      return;
    }
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

export async function deleteProduct(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const existing = await pool.query<{
      user_id: string;
      responsible_id: string | null;
      images: unknown;
      secondary_images: unknown;
    }>(
      `SELECT user_id, responsible_id, images, secondary_images FROM products p
       INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE p.id = $1`,
      [id, userId]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    const row = existing.rows[0];
    await assertModulePermission(userId, 'products', 'delete', {
      ownerId: row.user_id,
      assigneeId: row.responsible_id,
    }, req);

    const variantImagesRes = await pool.query<{ images: unknown }>(
      `SELECT images FROM product_variants WHERE product_id = $1`,
      [id]
    );
    const variantImageUrls = collectVariantImageUrls(variantImagesRes.rows);

    const result = await pool.query(
      `DELETE FROM products WHERE id = $1 AND ${whereUserInTenantFromUserId('user_id', 2)} RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    try {
      await unlinkStoredProductImageUrls({
        images: [...parseJsonArray<string>(row.images), ...variantImageUrls],
        secondaryImages: row.secondary_images,
        tenantId: getTenantIdOrNull(req.tenantId),
        ownerUserId: row.user_id,
      });
    } catch (cleanupErr) {
      console.warn('[deleteProduct] limpeza de mídia falhou', {
        productId: id,
        message: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
      });
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getPublicProducts(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT ${PUBLIC_PRODUCT_SELECT},
          (
            SELECT MAX(pv.price)::float
            FROM product_variants pv
            WHERE pv.product_id = p.id AND pv.is_active = true AND pv.price IS NOT NULL
          ) AS price_max
       FROM products p
       LEFT JOIN store_profiles sp ON sp.user_id = p.user_id
       WHERE p.user_id = $1 AND p.status = 'active' AND p.is_public = true
         AND (
           (p.type = 'product' AND COALESCE(sp.enable_products, true) = true)
           OR (p.type = 'service' AND COALESCE(sp.enable_services, true) = true)
           OR sp.user_id IS NULL
         )
       ORDER BY p.created_at DESC`,
      [userId]
    );

    const products = result.rows.map((row) =>
      toPublicProductDto(row as Record<string, unknown>, {
        price_max: row.price_max != null ? Number(row.price_max) : null,
      })
    );
    res.json(products);
  } catch (error) {
    console.error('Error fetching public products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET público: detalhe por slug da loja + id do produto (sem auth). Inclui variantes ativas (PV14). */
export async function getPublicProductByStoreSlugAndProductId(req: Request, res: Response): Promise<void> {
  try {
    const { slug, productId } = req.params;

    const result = await pool.query(
      `SELECT ${PUBLIC_PRODUCT_SELECT}
       FROM products p
       INNER JOIN store_profiles sp ON sp.user_id = p.user_id AND sp.store_slug = $1
       WHERE p.id = $2 AND p.status = 'active' AND p.is_public = true
         AND (
           (p.type = 'product' AND COALESCE(sp.enable_products, true) = true)
           OR (p.type = 'service' AND COALESCE(sp.enable_services, true) = true)
         )`,
      [slug, productId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const row = result.rows[0] as Record<string, unknown>;
    let variants: ReturnType<typeof toPublicVariantDto>[] | undefined;
    let price_max: number | null = null;

    if (row.has_variants) {
      const vr = await pool.query(
        `SELECT id, sku, option1_name, option1_value, option2_name, option2_value,
                price, discount_price, stock_quantity, images, is_active, position
         FROM product_variants
         WHERE product_id = $1 AND is_active = true
         ORDER BY position ASC, created_at ASC`,
        [productId]
      );
      variants = vr.rows.map((r) => toPublicVariantDto(r as Record<string, unknown>));
      const prices = variants
        .map((v) => (v.price != null ? Number(v.price) : null))
        .filter((p): p is number => p != null);
      price_max = prices.length > 0 ? Math.max(...prices) : null;
    }

    res.json(toPublicProductDto(row, { variants, price_max }));
  } catch (error) {
    console.error('Error fetching public product by slug:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/** Export para testes / futuros loaders. */
export { listVariantsForProducts };
