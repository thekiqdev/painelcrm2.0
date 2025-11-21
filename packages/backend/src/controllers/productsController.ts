import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

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
    const userId = req.userId!;
    
    const result = await pool.query(
      'SELECT * FROM products WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
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
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getProductById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM products WHERE id = $1 AND user_id = $2',
      [id, userId]
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
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createProduct(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const productData = productSchema.parse(req.body);

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
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
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

    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getPublicProducts(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT * FROM products 
       WHERE user_id = $1 AND status = 'active' AND is_public = true 
       ORDER BY created_at DESC`,
      [userId]
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
    console.error('Error fetching public products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

