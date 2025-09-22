-- Criar tabela de produtos/serviços
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('product', 'service')),
  price DECIMAL(10,2),
  currency TEXT NOT NULL DEFAULT 'BRL',
  images JSONB DEFAULT '[]',
  features JSONB DEFAULT '[]',
  category TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
  is_public BOOLEAN NOT NULL DEFAULT true,
  duration_hours INTEGER, -- para serviços
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Criar políticas RLS para produtos
CREATE POLICY "Users can view their own products" 
ON public.products 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own products" 
ON public.products 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own products" 
ON public.products 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own products" 
ON public.products 
FOR DELETE 
USING (auth.uid() = user_id);

-- Política pública para visualização da loja
CREATE POLICY "Public can view active products" 
ON public.products 
FOR SELECT 
USING (status = 'active' AND is_public = true);

-- Criar tabela de perfis de loja
CREATE TABLE public.store_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  store_name TEXT NOT NULL,
  store_description TEXT,
  store_logo TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  contact_whatsapp TEXT,
  store_slug TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS para store_profiles
ALTER TABLE public.store_profiles ENABLE ROW LEVEL SECURITY;

-- Políticas para store_profiles
CREATE POLICY "Users can manage their own store profile" 
ON public.store_profiles 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Política pública para visualizar lojas ativas
CREATE POLICY "Public can view active store profiles" 
ON public.store_profiles 
FOR SELECT 
USING (is_active = true);

-- Criar trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_store_profiles_updated_at
BEFORE UPDATE ON public.store_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();