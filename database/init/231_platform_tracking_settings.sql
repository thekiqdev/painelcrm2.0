-- Configuração global Meta Pixel (Super Admin).

CREATE TABLE IF NOT EXISTS public.platform_tracking_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_pixel_enabled boolean NOT NULL DEFAULT false,
  meta_pixel_id text NULL,
  meta_track_page_view boolean NOT NULL DEFAULT true,
  meta_track_lead boolean NOT NULL DEFAULT true,
  meta_track_complete_registration boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_tracking_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.platform_tracking_settings LIMIT 1);
