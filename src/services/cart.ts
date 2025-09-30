import { supabase } from '@/integrations/supabase/client';
import { ShoppingCart, CartItem, Order } from '@/types/products';

export class CartService {
  private getSessionId(): string {
    let sessionId = localStorage.getItem('cart_session_id');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('cart_session_id', sessionId);
    }
    return sessionId;
  }

  async getOrCreateCart(storeUserId: string): Promise<ShoppingCart> {
    const { data: { user } } = await supabase.auth.getUser();
    const sessionId = this.getSessionId();

    // Tentar buscar carrinho existente
    let query = supabase
      .from('shopping_carts')
      .select('*, cart_items(*, products(*))')
      .eq('store_user_id', storeUserId);

    if (user) {
      query = query.eq('user_id', user.id);
    } else {
      query = query.eq('session_id', sessionId);
    }

    const { data: existingCart, error: fetchError } = await query.maybeSingle();

    if (existingCart) {
      return existingCart as ShoppingCart;
    }

    // Criar novo carrinho
    const cartData: any = {
      store_user_id: storeUserId,
    };

    if (user) {
      cartData.user_id = user.id;
    } else {
      cartData.session_id = sessionId;
    }

    const { data: newCart, error: createError } = await supabase
      .from('shopping_carts')
      .insert(cartData)
      .select()
      .single();

    if (createError) throw createError;
    return newCart as ShoppingCart;
  }

  async addToCart(storeUserId: string, productId: string, quantity: number, selectedVariation?: any): Promise<CartItem> {
    const cart = await this.getOrCreateCart(storeUserId);

    // Verificar se o produto já está no carrinho
    const { data: existingItem } = await supabase
      .from('cart_items')
      .select('*')
      .eq('cart_id', cart.id)
      .eq('product_id', productId)
      .maybeSingle();

    if (existingItem) {
      // Atualizar quantidade
      const { data, error } = await supabase
        .from('cart_items')
        .update({ 
          quantity: existingItem.quantity + quantity,
          selected_variation: selectedVariation || existingItem.selected_variation
        })
        .eq('id', existingItem.id)
        .select()
        .single();

      if (error) throw error;
      return data as CartItem;
    }

    // Adicionar novo item
    const { data, error } = await supabase
      .from('cart_items')
      .insert({
        cart_id: cart.id,
        product_id: productId,
        quantity,
        selected_variation: selectedVariation
      })
      .select()
      .single();

    if (error) throw error;
    return data as CartItem;
  }

  async updateCartItemQuantity(itemId: string, quantity: number): Promise<void> {
    if (quantity <= 0) {
      await this.removeFromCart(itemId);
      return;
    }

    const { error } = await supabase
      .from('cart_items')
      .update({ quantity })
      .eq('id', itemId);

    if (error) throw error;
  }

  async removeFromCart(itemId: string): Promise<void> {
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', itemId);

    if (error) throw error;
  }

  async getCartItems(storeUserId: string): Promise<CartItem[]> {
    const cart = await this.getOrCreateCart(storeUserId);

    const { data, error } = await supabase
      .from('cart_items')
      .select('*, products(*)')
      .eq('cart_id', cart.id);

    if (error) throw error;
    return (data || []) as CartItem[];
  }

  async clearCart(storeUserId: string): Promise<void> {
    const cart = await this.getOrCreateCart(storeUserId);

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('cart_id', cart.id);

    if (error) throw error;
  }

  async createOrder(orderData: {
    storeUserId: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    items: { productId: string; quantity: number; unitPrice: number; selectedVariation?: any }[];
    paymentMethod?: string;
    notes?: string;
  }): Promise<Order> {
    const { data: { user } } = await supabase.auth.getUser();
    
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const totalAmount = orderData.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

    // Criar pedido
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        store_user_id: orderData.storeUserId,
        customer_user_id: user?.id,
        customer_name: orderData.customerName,
        customer_email: orderData.customerEmail,
        customer_phone: orderData.customerPhone,
        total_amount: totalAmount,
        payment_method: orderData.paymentMethod,
        notes: orderData.notes,
        status: 'pending',
        payment_status: 'pending'
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // Buscar informações dos produtos
    const productIds = orderData.items.map(item => item.productId);
    const { data: products } = await supabase
      .from('products')
      .select('id, name, type')
      .in('id', productIds);

    // Criar itens do pedido
    const orderItems = orderData.items.map(item => {
      const product = products?.find(p => p.id === item.productId);
      return {
        order_id: order.id,
        product_id: item.productId,
        product_name: product?.name || 'Produto',
        product_type: product?.type || 'product',
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.unitPrice * item.quantity,
        selected_variation: item.selectedVariation
      };
    });

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) throw itemsError;

    // Limpar carrinho
    await this.clearCart(orderData.storeUserId);

    return order as Order;
  }

  async getOrders(storeUserId?: string): Promise<Order[]> {
    let query = supabase
      .from('orders')
      .select('*, order_items(*)');

    if (storeUserId) {
      query = query.eq('store_user_id', storeUserId);
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        query = query.eq('customer_user_id', user.id);
      }
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as Order[];
  }
}

export const cartService = new CartService();
