export interface ProductVariation {
  id?: string;
  name: string; // ex: "Cor", "Tamanho" 
  values: string[]; // ex: ["Azul", "Vermelho"], ["P", "M", "G"]
}

export interface Product {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  type: 'product' | 'service';
  price?: number;
  discount_price?: number; // preço com desconto
  currency: string;
  images: string[];
  secondary_images?: string[]; // imagens secundárias
  features: string[];
  variations?: ProductVariation[]; // para produtos
  category?: string;
  status: 'active' | 'inactive' | 'draft';
  is_public: boolean;
  duration_hours?: number; // para serviços
  contract_template?: string; // para serviços - template de contrato
  has_contract?: boolean; // se o serviço tem contrato vinculado
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
  discount_price?: number;
  currency: string;
  category?: string;
  features: string[];
  images: string[];
  secondary_images?: string[];
  variations?: ProductVariation[];
  duration_hours?: number;
  contract_template?: string;
  has_contract?: boolean;
  is_public: boolean;
}