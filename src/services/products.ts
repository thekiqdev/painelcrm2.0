import { supabase } from '@/integrations/supabase/client';
import { Product, StoreProfile, ProductFormData } from '@/types/products';

export class ProductsService {
  async getProducts(): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as Product[];
  }

  async getProductById(id: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Product;
  }

  async createProduct(productData: ProductFormData): Promise<Product> {
    const { data, error } = await supabase
      .from('products')
      .insert({
        ...productData,
        status: 'active'
      } as any)
      .select()
      .single();

    if (error) throw error;
    return data as Product;
  }

  async updateProduct(id: string, productData: Partial<ProductFormData>): Promise<Product> {
    const { data, error } = await supabase
      .from('products')
      .update(productData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Product;
  }

  async deleteProduct(id: string): Promise<void> {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async getStoreProfile(): Promise<StoreProfile | null> {
    const { data, error } = await supabase
      .from('store_profiles')
      .select('*')
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data as StoreProfile | null;
  }

  async createStoreProfile(storeData: Omit<StoreProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<StoreProfile> {
    const { data, error } = await supabase
      .from('store_profiles')
      .insert(storeData as any)
      .select()
      .single();

    if (error) throw error;
    return data as StoreProfile;
  }

  async updateStoreProfile(storeData: Partial<StoreProfile>): Promise<StoreProfile> {
    const { data, error } = await supabase
      .from('store_profiles')
      .update(storeData)
      .select()
      .single();

    if (error) throw error;
    return data as StoreProfile;
  }

  // Métodos públicos (sem autenticação)
  async getPublicProducts(userId: string): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as Product[];
  }

  async getPublicStoreProfile(userId: string): Promise<StoreProfile | null> {
    const { data, error } = await supabase
      .from('store_profiles')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data as StoreProfile | null;
  }

  async getPublicStoreBySlug(slug: string): Promise<StoreProfile | null> {
    const { data, error } = await supabase
      .from('store_profiles')
      .select('*')
      .eq('store_slug', slug)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data as StoreProfile | null;
  }
}

export const productsService = new ProductsService();