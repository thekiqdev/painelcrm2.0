-- Create sales_funnels table
CREATE TABLE IF NOT EXISTS public.sales_funnels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  source TEXT,
  is_default BOOLEAN DEFAULT false,
  profile_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create funnel_stages table
CREATE TABLE IF NOT EXISTS public.funnel_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  funnel_id UUID NOT NULL REFERENCES public.sales_funnels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  order_position INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_sales_funnels_user_id ON public.sales_funnels(user_id);
CREATE INDEX idx_sales_funnels_profile_id ON public.sales_funnels(profile_id);
CREATE INDEX idx_funnel_stages_funnel_id ON public.funnel_stages(funnel_id);
CREATE INDEX idx_funnel_stages_user_id ON public.funnel_stages(user_id);

-- Create triggers for updated_at
CREATE TRIGGER update_sales_funnels_updated_at
  BEFORE UPDATE ON public.sales_funnels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_funnel_stages_updated_at
  BEFORE UPDATE ON public.funnel_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


