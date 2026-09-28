-- Primeiros passos (dashboard): usuário pode dispensar o bloco; persistido por perfil (mesmo id do user).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hide_dashboard_activation_checklist BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.hide_dashboard_activation_checklist IS 'Quando true, o card Primeiros passos não é exibido no dashboard para este usuário.';
