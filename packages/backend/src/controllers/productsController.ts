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

/** V2-1: campos expostos em APIs públicas (lista e detalhe por slug); sem variations. */
const PUBLIC_PRODUCT_SELECT = `
  p.id, p.name, p.type, p.short_description, p.description, p.price, p.discount_price, p.currency,
  p.category, p.images, p.features, p.secondary_images, p.duration_hours, p.is_recurring, p.recurrence_interval
` as const;

function parseJsonArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return [];
}

function toPublicProductDto(row: Record<string, unknown>) {
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
  };
}

const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['product', 'service']),
  price: z.number().optional(),
  currency: z.string().default('BRL'),
  images: z.array(z.any()).default([]),
  features: z.array(z.any()).default([]),
  category: z.string().optional(),
  status: z.enum(['active', 'inactive', 'draft']).default('active'),
  is_public: z.boolean().default(true),
  duration_hours: z.number().optional(),
  cost: z.number().optional(),
  sku: z.string().optional(),
  stock_quantity: z.number().optional(),
  min_stock_quantity: z.number().optional(),
  responsible_id: z.string().uuid().optional(),
  short_description: z.string().optional(),
  discount_price: z.number().optional(),
  secondary_images: z.array(z.any()).default([]),
  variations: z.array(z.any()).default([]),
  contract_template: z.string().optional(),
  has_contract: z.boolean().default(false),
  is_recurring: z.boolean().default(false),
  recurrence_interval: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
});

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
      `SELECT p.* FROM products p
       ${joinUserTenant('p', 'user_id', 1)}
       ORDER BY p.created_at DESC`,
      [tenantId]
    );

    // Convert DECIMAL fields to numbers
    const products = result.rows.map(product => ({
      ...product,
      price: product.price ? parseFloat(product.price) : null,
      discount_price: product.discount_price ? parseFloat(product.discount_price) : null,
      cost: product.cost ? parseFloat(product.cost) : null,
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

    const product = result.rows[0];
    const formattedProduct = {
      ...product,
      price: product.price ? parseFloat(product.price) : null,
      discount_price: product.discount_price ? parseFloat(product.discount_price) : null,
      cost: product.cost ? parseFloat(product.cost) : null,
    };

    res.json(formattedProduct);
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
  try {
    const userId = ensureUserIdForInsert(req);
    const productData = productSchema.parse(req.body);

    await assertModulePermission(userId, 'products', 'create', undefined, req);

    const result = await pool.query(
      `INSERT INTO products (
        user_id, name, description, type, price, currency, images, features,
        category, status, is_public, duration_hours, cost, sku, stock_quantity,
        min_stock_quantity, responsible_id, short_description, discount_price,
        secondary_images, variations, contract_template, has_contract,
        is_recurring, recurrence_interval
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
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
        productData.recurrence_interval
      ]
    );

    // Convert DECIMAL fields to numbers
    const product = result.rows[0];
    const formattedProduct = {
      ...product,
      price: product.price ? parseFloat(product.price) : null,
      discount_price: product.discount_price ? parseFloat(product.discount_price) : null,
      cost: product.cost ? parseFloat(product.cost) : null,
    };

    res.status(201).json(formattedProduct);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
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
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateProduct(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const productData = productSchema.partial().parse(req.body);

    const existing = await pool.query<{ user_id: string; responsible_id: string | null }>(
      `SELECT user_id, responsible_id FROM products p
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

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(productData).forEach(([key, value]) => {
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

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id, userId);
    const result = await pool.query(
      `UPDATE products 
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramIndex} AND ${whereUserInTenantFromUserId('user_id', paramIndex + 1)}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    // Convert DECIMAL fields to numbers
    const product = result.rows[0];
    const formattedProduct = {
      ...product,
      price: product.price ? parseFloat(product.price) : null,
      discount_price: product.discount_price ? parseFloat(product.discount_price) : null,
      cost: product.cost ? parseFloat(product.cost) : null,
    };

    res.json(formattedProduct);
  } catch (error) {
    if (error instanceof ModulePermissionError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteProduct(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const existing = await pool.query<{ user_id: string; responsible_id: string | null }>(
      `SELECT user_id, responsible_id FROM products p
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

    const result = await pool.query(
      `DELETE FROM products WHERE id = $1 AND ${whereUserInTenantFromUserId('user_id', 2)} RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
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
      `SELECT ${PUBLIC_PRODUCT_SELECT}
       FROM products p
       WHERE p.user_id = $1 AND p.status = 'active' AND p.is_public = true 
       ORDER BY p.created_at DESC`,
      [userId]
    );

    const products = result.rows.map(row => toPublicProductDto(row as Record<string, unknown>));
    res.json(products);
  } catch (error) {
    console.error('Error fetching public products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/** GET público: detalhe por slug da loja + id do produto (sem auth). */
export async function getPublicProductByStoreSlugAndProductId(req: Request, res: Response): Promise<void> {
  try {
    const { slug, productId } = req.params;

    const result = await pool.query(
      `SELECT ${PUBLIC_PRODUCT_SELECT}
       FROM products p
       INNER JOIN store_profiles sp ON sp.user_id = p.user_id AND sp.store_slug = $1
       WHERE p.id = $2 AND p.status = 'active' AND p.is_public = true`,
      [slug, productId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    res.json(toPublicProductDto(result.rows[0] as Record<string, unknown>));
  } catch (error) {
    console.error('Error fetching public product by slug:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

