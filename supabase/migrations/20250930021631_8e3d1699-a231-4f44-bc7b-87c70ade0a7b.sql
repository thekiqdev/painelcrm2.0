-- Adicionar novos campos para produtos e serviços
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS cost DECIMAL,
ADD COLUMN IF NOT EXISTS sku TEXT,
ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_stock_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS responsible_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS short_description TEXT,
ADD COLUMN IF NOT EXISTS discount_price DECIMAL,
ADD COLUMN IF NOT EXISTS secondary_images JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS variations JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS contract_template TEXT,
ADD COLUMN IF NOT EXISTS has_contract BOOLEAN DEFAULT false;

-- Criar índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_responsible ON products(responsible_id);

-- Criar tabela de carrinho de compras
CREATE TABLE IF NOT EXISTS shopping_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  store_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, store_user_id),
  UNIQUE(session_id, store_user_id)
);

-- Criar tabela de itens do carrinho
CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES shopping_carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  selected_variation JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT positive_quantity CHECK (quantity > 0)
);

-- Criar tabela de pedidos
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  store_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  total_amount DECIMAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar tabela de itens do pedido
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  product_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL NOT NULL,
  total_price DECIMAL NOT NULL,
  selected_variation JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS para carrinho de compras
ALTER TABLE shopping_carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own carts"
  ON shopping_carts FOR SELECT
  USING (auth.uid() = user_id OR session_id IS NOT NULL);

CREATE POLICY "Users can create their own carts"
  ON shopping_carts FOR INSERT
  WITH CHECK (auth.uid() = user_id OR session_id IS NOT NULL);

CREATE POLICY "Users can update their own carts"
  ON shopping_carts FOR UPDATE
  USING (auth.uid() = user_id OR session_id IS NOT NULL);

CREATE POLICY "Users can delete their own carts"
  ON shopping_carts FOR DELETE
  USING (auth.uid() = user_id OR session_id IS NOT NULL);

-- RLS para itens do carrinho
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their cart items"
  ON cart_items FOR SELECT
  USING (cart_id IN (SELECT id FROM shopping_carts WHERE user_id = auth.uid() OR session_id IS NOT NULL));

CREATE POLICY "Users can manage their cart items"
  ON cart_items FOR ALL
  USING (cart_id IN (SELECT id FROM shopping_carts WHERE user_id = auth.uid() OR session_id IS NOT NULL));

-- RLS para pedidos
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store owners can view their orders"
  ON orders FOR SELECT
  USING (auth.uid() = store_user_id);

CREATE POLICY "Customers can view their orders"
  ON orders FOR SELECT
  USING (auth.uid() = customer_user_id);

CREATE POLICY "Anyone can create orders"
  ON orders FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Store owners can update their orders"
  ON orders FOR UPDATE
  USING (auth.uid() = store_user_id);

-- RLS para itens do pedido
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view order items from their orders"
  ON order_items FOR SELECT
  USING (order_id IN (
    SELECT id FROM orders 
    WHERE store_user_id = auth.uid() OR customer_user_id = auth.uid()
  ));

CREATE POLICY "Store owners can manage order items"
  ON order_items FOR ALL
  USING (order_id IN (
    SELECT id FROM orders WHERE store_user_id = auth.uid()
  ));

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_shopping_carts_updated_at
  BEFORE UPDATE ON shopping_carts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cart_items_updated_at
  BEFORE UPDATE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();