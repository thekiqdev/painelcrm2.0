import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const cartItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1),
  selected_variation: z.any().optional().nullable(),
});

// Get or create cart for a store
export async function getOrCreateCart(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { storeUserId } = req.params;

    // Try to find existing cart
    let cartResult = await pool.query(
      `SELECT * FROM shopping_carts 
       WHERE store_user_id = $1 AND user_id = $2`,
      [storeUserId, userId]
    );

    let cart;
    if (cartResult.rows.length === 0) {
      // Create new cart
      const createResult = await pool.query(
        `INSERT INTO shopping_carts (user_id, store_user_id)
         VALUES ($1, $2)
         RETURNING *`,
        [userId, storeUserId]
      );
      cart = createResult.rows[0];
    } else {
      cart = cartResult.rows[0];
    }

    // Get cart items with products
    const itemsResult = await pool.query(
      `SELECT ci.*, 
              json_build_object(
                'id', p.id,
                'name', p.name,
                'price', p.price,
                'discount_price', p.discount_price,
                'images', p.images,
                'type', p.type
              ) as product
       FROM cart_items ci
       LEFT JOIN products p ON ci.product_id = p.id
       WHERE ci.cart_id = $1
       ORDER BY ci.created_at`,
      [cart.id]
    );

    res.json({
      ...cart,
      cart_items: itemsResult.rows.map(item => ({
        ...item,
        product: item.product,
      })),
    });
  } catch (error) {
    console.error('Error getting/creating cart:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Add item to cart
export async function addToCart(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { storeUserId } = req.params;
    const itemData = cartItemSchema.parse(req.body);

    // Get or create cart
    let cartResult = await pool.query(
      `SELECT * FROM shopping_carts 
       WHERE store_user_id = $1 AND user_id = $2`,
      [storeUserId, userId]
    );

    let cart;
    if (cartResult.rows.length === 0) {
      const createResult = await pool.query(
        `INSERT INTO shopping_carts (user_id, store_user_id)
         VALUES ($1, $2)
         RETURNING *`,
        [userId, storeUserId]
      );
      cart = createResult.rows[0];
    } else {
      cart = cartResult.rows[0];
    }

    // Check if item already exists
    const existingItemResult = await pool.query(
      `SELECT * FROM cart_items 
       WHERE cart_id = $1 AND product_id = $2`,
      [cart.id, itemData.product_id]
    );

    let item;
    if (existingItemResult.rows.length > 0) {
      // Update quantity
      const updateResult = await pool.query(
        `UPDATE cart_items 
         SET quantity = quantity + $1,
             selected_variation = COALESCE($2, selected_variation),
             updated_at = now()
         WHERE id = $3
         RETURNING *`,
        [itemData.quantity, itemData.selected_variation, existingItemResult.rows[0].id]
      );
      item = updateResult.rows[0];
    } else {
      // Create new item
      const insertResult = await pool.query(
        `INSERT INTO cart_items (cart_id, product_id, quantity, selected_variation)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [cart.id, itemData.product_id, itemData.quantity, itemData.selected_variation]
      );
      item = insertResult.rows[0];
    }

    // Get product info
    const productResult = await pool.query(
      `SELECT id, name, price, discount_price, images, type
       FROM products
       WHERE id = $1`,
      [itemData.product_id]
    );

    res.status(201).json({
      ...item,
      product: productResult.rows[0] || null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error adding to cart:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Update cart item quantity
export async function updateCartItem(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 0) {
      res.status(400).json({ error: 'Quantity must be greater than 0' });
      return;
    }

    // Verify cart belongs to user
    const verifyResult = await pool.query(
      `SELECT ci.id FROM cart_items ci
       INNER JOIN shopping_carts sc ON ci.cart_id = sc.id
       WHERE ci.id = $1 AND sc.user_id = $2`,
      [itemId, userId]
    );

    if (verifyResult.rows.length === 0) {
      res.status(404).json({ error: 'Cart item not found' });
      return;
    }

    if (quantity === 0) {
      // Delete item
      await pool.query('DELETE FROM cart_items WHERE id = $1', [itemId]);
      res.json({ message: 'Item removed from cart' });
      return;
    }

    const result = await pool.query(
      `UPDATE cart_items 
       SET quantity = $1, updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [quantity, itemId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating cart item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Remove item from cart
export async function removeCartItem(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { itemId } = req.params;

    // Verify cart belongs to user
    const verifyResult = await pool.query(
      `SELECT ci.id FROM cart_items ci
       INNER JOIN shopping_carts sc ON ci.cart_id = sc.id
       WHERE ci.id = $1 AND sc.user_id = $2`,
      [itemId, userId]
    );

    if (verifyResult.rows.length === 0) {
      res.status(404).json({ error: 'Cart item not found' });
      return;
    }

    await pool.query('DELETE FROM cart_items WHERE id = $1', [itemId]);
    res.json({ message: 'Item removed from cart' });
  } catch (error) {
    console.error('Error removing cart item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get cart items
export async function getCartItems(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { storeUserId } = req.params;

    // Get cart
    const cartResult = await pool.query(
      `SELECT * FROM shopping_carts 
       WHERE store_user_id = $1 AND user_id = $2`,
      [storeUserId, userId]
    );

    if (cartResult.rows.length === 0) {
      res.json([]);
      return;
    }

    const cart = cartResult.rows[0];

    // Get items with products
    const itemsResult = await pool.query(
      `SELECT ci.*, 
              json_build_object(
                'id', p.id,
                'name', p.name,
                'price', p.price,
                'discount_price', p.discount_price,
                'images', p.images,
                'type', p.type
              ) as product
       FROM cart_items ci
       LEFT JOIN products p ON ci.product_id = p.id
       WHERE ci.cart_id = $1
       ORDER BY ci.created_at`,
      [cart.id]
    );

    // Convert DECIMAL fields to numbers
    const items = itemsResult.rows.map(item => ({
      ...item,
      product: item.product ? {
        ...item.product,
        price: item.product.price ? parseFloat(item.product.price) : null,
        discount_price: item.product.discount_price ? parseFloat(item.product.discount_price) : null,
      } : null,
    }));

    res.json(items);
  } catch (error) {
    console.error('Error getting cart items:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Clear cart
export async function clearCart(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { storeUserId } = req.params;

    // Get cart
    const cartResult = await pool.query(
      `SELECT * FROM shopping_carts 
       WHERE store_user_id = $1 AND user_id = $2`,
      [storeUserId, userId]
    );

    if (cartResult.rows.length === 0) {
      res.status(404).json({ error: 'Cart not found' });
      return;
    }

    const cart = cartResult.rows[0];

    // Delete all items
    await pool.query('DELETE FROM cart_items WHERE cart_id = $1', [cart.id]);
    res.json({ message: 'Cart cleared' });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}


