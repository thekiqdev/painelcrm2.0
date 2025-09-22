export interface Product {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  type: 'product' | 'service';
  price?: number;
  currency: string;
  images: string[];
  features: string[];
  category?: string;
  status: 'active' | 'inactive' | 'draft';
  is_public: boolean;
  duration_hours?: number; // para serviços
  created_at?: string;
  updated_at?: string;
}

export interface StoreProfile {
  id: string;
  user_id: string;
  store_name: string;
  store_description?: string;
  store_logo?: string;
  contact_phone?: string;
  contact_email?: string;
  contact_whatsapp?: string;
  store_slug?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export type ProductFormStep = 1 | 2 | 3;

export interface ProductFormData {
  type: 'product' | 'service';
  name: string;
  description?: string;
  price?: number;
  currency: string;
  category?: string;
  features: string[];
  images: string[];
  duration_hours?: number;
  is_public: boolean;
}