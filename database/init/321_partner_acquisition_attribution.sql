-- M5 S4 — attribution Partner/seller em acquisition + helpers

ALTER TABLE public.acquisition_leads
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS seller_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS seller_referral_code TEXT;

ALTER TABLE public.acquisition_onboarding_sessions
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS seller_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS seller_referral_code TEXT;

CREATE INDEX IF NOT EXISTS idx_acquisition_leads_partner_id
  ON public.acquisition_leads (partner_id)
  WHERE partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acquisition_leads_seller_user_id
  ON public.acquisition_leads (seller_user_id)
  WHERE seller_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acquisition_sessions_partner_id
  ON public.acquisition_onboarding_sessions (partner_id)
  WHERE partner_id IS NOT NULL;

COMMENT ON COLUMN public.acquisition_leads.partner_id IS 'Partner do canal (host WL); null = venda direta';
COMMENT ON COLUMN public.acquisition_leads.seller_user_id IS 'Vendedor atribuído via ?ref=; null = carteira casa';
