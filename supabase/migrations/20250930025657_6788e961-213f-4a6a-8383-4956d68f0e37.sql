-- Add recurrence fields to products table for recurring services
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS recurrence_interval text CHECK (recurrence_interval IN ('daily', 'weekly', 'monthly', 'yearly'));

COMMENT ON COLUMN public.products.is_recurring IS 'Indicates if the service is recurring or one-time';
COMMENT ON COLUMN public.products.recurrence_interval IS 'Recurrence interval: daily, weekly, monthly, or yearly';