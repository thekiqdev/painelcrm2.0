import { apiClient } from '@/integrations/api/client';
import { Product, StoreProfile, ProductFormData } from '@/types/products';

export class ProductsService {
  async getProducts(): Promise<Product[]> {
    const response = await apiClient.get<Product[]>('/api/products');
    if (response.error) throw new Error(response.error);
    
    return (response.data || []).map(item => ({
      ...item,
      features: (item.features as any) || [],
      images: (item.images as any) || [],
      secondary_images: (item.secondary_images as any) || [],
      variations: (item.variations as any) || []
    })) as Product[];
  }

  async getProductById(id: string): Promise<Product | null> {
    const response = await apiClient.get<Product>(`/api/products/${id}`);
    if (response.error) throw new Error(response.error);
    if (!response.data) return null;
    
    return {
      ...response.data,
      features: (response.data.features as any) || [],
      images: (response.data.images as any) || [],
      secondary_images: (response.data.secondary_images as any) || [],
      variations: (response.data.variations as any) || []
    } as Product;
  }

  async createProduct(productData: ProductFormData): Promise<Product> {
    const response = await apiClient.post<Product>('/api/products', {
        ...productData,
        features: productData.features as any,
        images: productData.images as any,
        secondary_images: productData.secondary_images as any,
        variations: productData.variations as any,
        status: 'active'
    });

    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('No data returned');
    
    return {
      ...response.data,
      features: (response.data.features as any) || [],
      images: (response.data.images as any) || [],
      secondary_images: (response.data.secondary_images as any) || [],
      variations: (response.data.variations as any) || []
    } as Product;
  }

  async updateProduct(id: string, productData: Partial<ProductFormData>): Promise<Product> {
    const updateData: any = { ...productData };
    if (productData.features) updateData.features = productData.features as any;
    if (productData.images) updateData.images = productData.images as any;
    if (productData.secondary_images) updateData.secondary_images = productData.secondary_images as any;
    if (productData.variations) updateData.variations = productData.variations as any;

    const response = await apiClient.patch<Product>(`/api/products/${id}`, updateData);

    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('No data returned');
    
    return {
      ...response.data,
      features: (response.data.features as any) || [],
      images: (response.data.images as any) || [],
      secondary_images: (response.data.secondary_images as any) || [],
      variations: (response.data.variations as any) || []
    } as Product;
  }

  async deleteProduct(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/products/${id}`);
    if (response.error) throw new Error(response.error);
  }

  async getStoreProfile(): Promise<StoreProfile | null> {
    const response = await apiClient.get<StoreProfile>('/api/store-profile');
    if (response.error && response.error !== 'Not found') throw new Error(response.error);
    return response.data || null;
  }

  async createStoreProfile(storeData: Omit<StoreProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<StoreProfile> {
    const response = await apiClient.post<StoreProfile>('/api/store-profile', storeData);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('No data returned');
    return response.data;
  }

  async updateStoreProfile(storeData: Partial<StoreProfile>): Promise<StoreProfile> {
    const response = await apiClient.patch<StoreProfile>('/api/store-profile', storeData);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('No data returned');
    return response.data;
  }

  // Métodos públicos (sem autenticação)
  async getPublicProducts(userId: string): Promise<Product[]> {
    const response = await apiClient.get<Product[]>(`/api/products/public/${userId}`);
    if (response.error) throw new Error(response.error);
    
    return (response.data || []).map(item => ({
      ...item,
      features: (item.features as any) || [],
      images: (item.images as any) || [],
      secondary_images: (item.secondary_images as any) || [],
      variations: (item.variations as any) || []
    })) as Product[];
  }

  async getPublicStoreProfile(userId: string): Promise<StoreProfile | null> {
    const response = await apiClient.get<StoreProfile>(`/api/store-profile/public/${userId}`);
    if (response.error && response.error !== 'Not found') throw new Error(response.error);
    return response.data || null;
  }

  async getPublicStoreBySlug(slug: string): Promise<StoreProfile | null> {
    const response = await apiClient.get<StoreProfile>(`/api/store-profile/public/slug/${slug}`);
    if (response.error && response.error !== 'Not found') throw new Error(response.error);
    return response.data || null;
  }
}

export const productsService = new ProductsService();