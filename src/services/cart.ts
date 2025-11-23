import { apiClient } from '@/integrations/api/client';
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
    try {
      const response = await apiClient.get<any>(`/api/cart/${storeUserId}`);
      if (response.error) throw new Error(response.error);
      
      return response.data as ShoppingCart;
    } catch (error: any) {
      console.error('Error getting/creating cart:', error);
      throw error;
    }
  }

  async addToCart(storeUserId: string, productId: string, quantity: number, selectedVariation?: any): Promise<CartItem> {
    try {
      const response = await apiClient.post<any>(`/api/cart/${storeUserId}/items`, {
        product_id: productId,
        quantity,
        selected_variation: selectedVariation || null,
      });
      
      if (response.error) throw new Error(response.error);
      return response.data as CartItem;
    } catch (error: any) {
      console.error('Error adding to cart:', error);
      throw error;
    }
  }

  async updateCartItemQuantity(itemId: string, quantity: number): Promise<void> {
    try {
      if (quantity <= 0) {
        await this.removeFromCart(itemId);
        return;
      }

      const response = await apiClient.patch(`/api/cart/items/${itemId}`, { quantity });
      if (response.error) throw new Error(response.error);
    } catch (error: any) {
      console.error('Error updating cart item:', error);
      throw error;
    }
  }

  async removeFromCart(itemId: string): Promise<void> {
    try {
      const response = await apiClient.delete(`/api/cart/items/${itemId}`);
      if (response.error) throw new Error(response.error);
    } catch (error: any) {
      console.error('Error removing from cart:', error);
      throw error;
    }
  }

  async getCartItems(storeUserId: string): Promise<CartItem[]> {
    try {
      const response = await apiClient.get<any[]>(`/api/cart/${storeUserId}/items`);
      if (response.error) throw new Error(response.error);
      
      return (response.data || []) as CartItem[];
    } catch (error: any) {
      console.error('Error getting cart items:', error);
      throw error;
    }
  }

  async clearCart(storeUserId: string): Promise<void> {
    try {
      const response = await apiClient.delete(`/api/cart/${storeUserId}`);
      if (response.error) throw new Error(response.error);
    } catch (error: any) {
      console.error('Error clearing cart:', error);
      throw error;
    }
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
    try {
      const response = await apiClient.post<any>('/api/orders', {
        store_user_id: orderData.storeUserId,
        customer_name: orderData.customerName,
        customer_email: orderData.customerEmail,
        customer_phone: orderData.customerPhone || null,
        items: orderData.items.map(item => ({
          product_id: item.productId,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          selected_variation: item.selectedVariation || null,
        })),
        payment_method: orderData.paymentMethod || null,
        notes: orderData.notes || null,
      });
      
      if (response.error) throw new Error(response.error);
      return response.data as Order;
    } catch (error: any) {
      console.error('Error creating order:', error);
      throw error;
    }
  }

  async getOrders(storeUserId?: string): Promise<Order[]> {
    try {
      const url = storeUserId ? `/api/orders?storeUserId=${storeUserId}` : '/api/orders';
      const response = await apiClient.get<any[]>(url);
      
      if (response.error) throw new Error(response.error);
      return (response.data || []) as Order[];
    } catch (error: any) {
      console.error('Error getting orders:', error);
      throw error;
    }
  }
}

export const cartService = new CartService();
