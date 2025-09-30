export interface ProductVariation {
  id?: string;
  name: string; // ex: "Cor", "Tamanho" 
  values: string[]; // ex: ["Azul", "Vermelho"], ["P", "M", "G"]
}

export interface VariationPrice {
  combination: string; // ex: "Branco-P", "Preto-M"
  price?: number;
}

export interface Product {
  id: string;
  user_id: string;
  name: string;
  short_description?: string; // descrição curta
  description?: string; // descrição longa
  type: 'product' | 'service';
  price?: number;
  discount_price?: number; // preço com desconto
  cost?: number; // custo do produto
  sku?: string; // código SKU
  stock_quantity?: number; // quantidade em estoque
  min_stock_quantity?: number; // quantidade mínima de estoque
  currency: string;
  images: string[];
  secondary_images?: string[]; // imagens secundárias
  features: string[];
  variations?: ProductVariation[]; // para produtos
  pricing_mode?: 'fixed' | 'per_variation';
  variation_prices?: VariationPrice[];
  category?: string;
  status: 'active' | 'inactive' | 'draft';
  is_public: boolean;
  duration_hours?: number; // para serviços
  responsible_id?: string; // responsável pelo serviço
  contract_template?: string; // para serviços - template de contrato
  has_contract?: boolean; // se o serviço tem contrato vinculado
  is_recurring?: boolean; // se o serviço é recorrente
  recurrence_interval?: 'daily' | 'weekly' | 'monthly' | 'yearly'; // intervalo de recorrência
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
  short_description?: string;
  description?: string;
  price?: number;
  discount_price?: number;
  cost?: number;
  sku?: string;
  stock_quantity?: number;
  min_stock_quantity?: number;
  currency: string;
  category?: string;
  features: string[];
  images: string[];
  secondary_images?: string[];
  variations?: ProductVariation[];
  pricing_mode?: 'fixed' | 'per_variation';
  variation_prices?: VariationPrice[];
  duration_hours?: number;
  responsible_id?: string;
  contract_template?: string;
  has_contract?: boolean;
  is_recurring?: boolean;
  recurrence_interval?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  is_public: boolean;
}

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  selected_variation?: any;
  product?: Product;
}

export interface ShoppingCart {
  id: string;
  user_id?: string;
  session_id?: string;
  store_user_id: string;
  items?: CartItem[];
  created_at?: string;
  updated_at?: string;
}

export interface Order {
  id: string;
  order_number: string;
  store_user_id: string;
  customer_user_id?: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  total_amount: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  payment_method?: string;
  payment_status: 'pending' | 'paid' | 'failed';
  notes?: string;
  created_at?: string;
  updated_at?: string;
}