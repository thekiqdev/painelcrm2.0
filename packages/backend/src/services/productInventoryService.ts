/**
 * PV Sprint 5 — baixa atômica de estoque no checkout da loja.
 */

type Queryable = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
};

export class InsufficientStockError extends Error {
  statusCode = 409;
  code = 'INSUFFICIENT_STOCK';
  constructor(message = 'Estoque insuficiente') {
    super(message);
    this.name = 'InsufficientStockError';
  }
}

export class InventoryValidationError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'InventoryValidationError';
  }
}

/** Pure: há quantidade suficiente? */
export function hasEnoughStock(stock: number | null | undefined, quantity: number): boolean {
  const available = Number(stock) || 0;
  return available >= quantity && quantity > 0;
}

export type DecrementInventoryResult = {
  trackInventory: boolean;
  remaining: number;
  scope: 'product' | 'variant' | 'skipped';
};

/**
 * Dentro de uma transação já aberta: trava produto (e variante) com FOR UPDATE,
 * valida estoque e decrementa. Se `track_inventory=false`, não bloqueia nem altera.
 *
 * Escopo explícito por `storeUserId` / `tenantId` (não depende só de RLS).
 */
export async function decrementInventoryForCheckout(
  client: Queryable,
  params: {
    productId: string;
    variantId: string | null;
    quantity: number;
    /** Dono da loja (products.user_id). */
    storeUserId: string;
    /** Tenant da variante (product_variants.tenant_id). */
    tenantId: string;
  }
): Promise<DecrementInventoryResult> {
  const qty = Math.floor(Number(params.quantity));
  if (!Number.isFinite(qty) || qty < 1) {
    throw new InventoryValidationError('Quantidade inválida para baixa de estoque');
  }

  const prodRes = await client.query(
    `SELECT id,
            COALESCE(has_variants, false) AS has_variants,
            COALESCE(track_inventory, true) AS track_inventory,
            stock_quantity
     FROM products
     WHERE id = $1 AND user_id = $2
     FOR UPDATE`,
    [params.productId, params.storeUserId]
  );

  if (prodRes.rows.length === 0) {
    throw new InventoryValidationError('Produto não encontrado para baixa de estoque');
  }

  const product = prodRes.rows[0] as {
    id: string;
    has_variants: boolean;
    track_inventory: boolean;
    stock_quantity: number | null;
  };

  if (!product.track_inventory) {
    return {
      trackInventory: false,
      remaining: Number(product.stock_quantity) || 0,
      scope: 'skipped',
    };
  }

  if (product.has_variants) {
    if (!params.variantId) {
      throw new InventoryValidationError('Variante obrigatória para baixa de estoque');
    }

    const vr = await client.query(
      `SELECT id, stock_quantity, is_active
       FROM product_variants
       WHERE id = $1 AND product_id = $2 AND tenant_id = $3
       FOR UPDATE`,
      [params.variantId, params.productId, params.tenantId]
    );

    if (vr.rows.length === 0 || !vr.rows[0].is_active) {
      throw new InventoryValidationError('Variante indisponível');
    }

    const variant = vr.rows[0] as { id: string; stock_quantity: number; is_active: boolean };
    if (!hasEnoughStock(variant.stock_quantity, qty)) {
      throw new InsufficientStockError(
        `Estoque insuficiente para a variante selecionada (disponível: ${Number(variant.stock_quantity) || 0}).`
      );
    }

    const updated = await client.query(
      `UPDATE product_variants
       SET stock_quantity = stock_quantity - $1, updated_at = now()
       WHERE id = $2 AND tenant_id = $3
       RETURNING stock_quantity`,
      [qty, variant.id, params.tenantId]
    );

    await client.query(
      `UPDATE products
       SET stock_quantity = (
             SELECT COALESCE(SUM(pv.stock_quantity), 0)::int
             FROM product_variants pv
             WHERE pv.product_id = $1 AND pv.is_active = true
           ),
           updated_at = now()
       WHERE id = $1 AND user_id = $2`,
      [params.productId, params.storeUserId]
    );

    return {
      trackInventory: true,
      remaining: Number(updated.rows[0]?.stock_quantity) || 0,
      scope: 'variant',
    };
  }

  if (!hasEnoughStock(product.stock_quantity, qty)) {
    throw new InsufficientStockError(
      `Estoque insuficiente (disponível: ${Number(product.stock_quantity) || 0}).`
    );
  }

  const updated = await client.query(
    `UPDATE products
     SET stock_quantity = COALESCE(stock_quantity, 0) - $1, updated_at = now()
     WHERE id = $2 AND user_id = $3
     RETURNING stock_quantity`,
    [qty, params.productId, params.storeUserId]
  );

  return {
    trackInventory: true,
    remaining: Number(updated.rows[0]?.stock_quantity) || 0,
    scope: 'product',
  };
}
