-- Sprint 7 — wizard de onboarding por etapas (estado na sessão)

ALTER TABLE public.acquisition_onboarding_sessions
  ADD COLUMN IF NOT EXISTS current_step TEXT NOT NULL DEFAULT 'company'
    CHECK (current_step IN ('provision', 'company', 'users', 'whatsapp', 'completed'));

ALTER TABLE public.acquisition_onboarding_sessions
  ADD COLUMN IF NOT EXISTS completed_steps JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.acquisition_onboarding_sessions
  ADD COLUMN IF NOT EXISTS activation_progress INT NOT NULL DEFAULT 0
    CHECK (activation_progress >= 0 AND activation_progress <= 100);

COMMENT ON COLUMN public.acquisition_onboarding_sessions.current_step IS
  'Etapa ativa do wizard: company | users | whatsapp | completed';
