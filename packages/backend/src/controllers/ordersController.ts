import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const orderItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1),
  unit_price: z.number().min(0),
  selected_variation: z.any().optional().nullable(),
});

const orderSchema = z.object({
  store_user_id: z.string().uuid(),
  customer_name: z.string().min(1),
  customer_email: z.string().email(),
  customer_phone: z.string().optional().nullable(),
  items: z.array(orderItemSchema).min(1),
  payment_method: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Create order
export async function createOrder(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const tenantId = req.tenantId ?? null;
    if (!tenantId) {
      res.status(403).json({ error: 'Usuário não vinculado a uma conta (tenant)' });
      return;
    }
    const orderData = orderSchema.parse(req.body);

    // Validar que todos os product_ids pertencem ao tenant atual (evita vazamento multi-tenant)
    const productIds = orderData.items.map(item => item.product_id);
    const uniqueProductIds = [...new Set(productIds)];
    const productsResult = await pool.query(
      `SELECT id, name, type FROM products
       WHERE id = ANY($1::uuid[])
         AND user_id IN (SELECT id FROM users WHERE tenant_id = $2)`,
      [uniqueProductIds, tenantId]
    );
    if (productsResult.rows.length !== uniqueProductIds.length) {
      res.status(400).json({
        error: 'Um ou mais produtos não existem ou não pertencem à sua conta. Verifique os itens do pedido.',
      });
      return;
    }
    const productsMap = new Map(productsResult.rows.map((p: { id: string; name: string; type: string }) => [p.id, p]));

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Generate order number
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      
      // Calculate total
      const totalAmount = orderData.items.reduce(
        (sum, item) => sum + (item.unit_price * item.quantity),
        0
      );

      // Create order
      const orderResult = await pool.query(
        `INSERT INTO orders (
          order_number, store_user_id, customer_user_id,
          customer_name, customer_email, customer_phone,
          total_amount, payment_method, notes, status, payment_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          orderNumber, orderData.store_user_id, userId,
          orderData.customer_name, orderData.customer_email, orderData.customer_phone,
          totalAmount, orderData.payment_method, orderData.notes,
          'pending', 'pending'
        ]
      );

      const order = orderResult.rows[0];

      // Create order items
      const orderItems = orderData.items.map(item => {
        const product = productsMap.get(item.product_id);
        return {
          order_id: order.id,
          product_id: item.product_id,
          product_name: product?.name || 'Produto',
          product_type: product?.type || 'product',
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.unit_price * item.quantity,
          selected_variation: item.selected_variation,
        };
      });

      for (const item of orderItems) {
        await pool.query(
          `INSERT INTO order_items (
            order_id, product_id, product_name, product_type,
            quantity, unit_price, total_price, selected_variation
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            item.order_id, item.product_id, item.product_name, item.product_type,
            item.quantity, item.unit_price, item.total_price, item.selected_variation
          ]
        );
      }

      // Clear cart
      const cartResult = await pool.query(
        `SELECT id FROM shopping_carts 
         WHERE store_user_id = $1 AND user_id = $2`,
        [orderData.store_user_id, userId]
      );

      if (cartResult.rows.length > 0) {
        await pool.query(
          'DELETE FROM cart_items WHERE cart_id = $1',
          [cartResult.rows[0].id]
        );
      }

      // Commit transaction
      await pool.query('COMMIT');

      // Get complete order with items
      const completeOrderResult = await pool.query(
        `SELECT o.*, 
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', oi.id,
                      'product_id', oi.product_id,
                      'product_name', oi.product_name,
                      'product_type', oi.product_type,
                      'quantity', oi.quantity,
                      'unit_price', oi.unit_price,
                      'total_price', oi.total_price,
                      'selected_variation', oi.selected_variation
                    )
                  ) FILTER (WHERE oi.id IS NOT NULL),
                  '[]'::json
                ) as order_items
         FROM orders o
         LEFT JOIN order_items oi ON o.id = oi.order_id
         WHERE o.id = $1
         GROUP BY o.id`,
        [order.id]
      );

      const completeOrder = completeOrderResult.rows[0];
      
      // Convert DECIMAL fields to numbers
      const formattedOrder = {
        ...completeOrder,
        total_amount: completeOrder.total_amount ? parseFloat(completeOrder.total_amount) : 0,
        order_items: (completeOrder.order_items || []).map((item: any) => ({
          ...item,
          unit_price: item.unit_price ? parseFloat(item.unit_price) : 0,
          total_price: item.total_price ? parseFloat(item.total_price) : 0,
        })),
      };

      res.status(201).json(formattedOrder);
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get orders
export async function getOrders(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { storeUserId, status } = req.query;

    let query = `
      SELECT o.*, 
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', oi.id,
                   'product_id', oi.product_id,
                   'product_name', oi.product_name,
                   'product_type', oi.product_type,
                   'quantity', oi.quantity,
                   'unit_price', oi.unit_price,
                   'total_price', oi.total_price,
                   'selected_variation', oi.selected_variation
                 )
               ) FILTER (WHERE oi.id IS NOT NULL),
               '[]'::json
             ) as order_items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (storeUserId) {
      query += ` AND o.store_user_id = $${paramIndex}`;
      params.push(storeUserId);
      paramIndex++;
    } else {
      query += ` AND o.customer_user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (status) {
      query += ` AND o.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` GROUP BY o.id ORDER BY o.created_at DESC`;

    const result = await pool.query(query, params);

    // Convert DECIMAL fields to numbers
    const orders = result.rows.map(order => ({
      ...order,
      total_amount: order.total_amount ? parseFloat(order.total_amount) : 0,
      order_items: (order.order_items || []).map((item: any) => ({
        ...item,
        unit_price: item.unit_price ? parseFloat(item.unit_price) : 0,
        total_price: item.total_price ? parseFloat(item.total_price) : 0,
      })),
    }));

    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get order by ID
export async function getOrderById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT o.*, 
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', oi.id,
                    'product_id', oi.product_id,
                    'product_name', oi.product_name,
                    'product_type', oi.product_type,
                    'quantity', oi.quantity,
                    'unit_price', oi.unit_price,
                    'total_price', oi.total_price,
                    'selected_variation', oi.selected_variation
                  )
                ) FILTER (WHERE oi.id IS NOT NULL),
                '[]'::json
              ) as order_items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.id = $1 AND (o.store_user_id = $2 OR o.customer_user_id = $2)
       GROUP BY o.id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const order = result.rows[0];
    
    // Convert DECIMAL fields to numbers
    const formattedOrder = {
      ...order,
      total_amount: order.total_amount ? parseFloat(order.total_amount) : 0,
      order_items: (order.order_items || []).map((item: any) => ({
        ...item,
        unit_price: item.unit_price ? parseFloat(item.unit_price) : 0,
        total_price: item.total_price ? parseFloat(item.total_price) : 0,
      })),
    };

    res.json(formattedOrder);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}


