-- IX Sprint 1 — a coluna já existe desde 157_profile_personal_and_password_change.sql.
-- Este comentário fixa o contrato: pt-BR, en, es. NULL = sem preferência.
-- Sem CHECK: linhas antigas podem ter alias (en-US); a API normaliza na leitura e na gravação.

COMMENT ON COLUMN public.profiles.locale IS
  'IX1: preferência de idioma do usuário. Canônicos pt-BR, en, es. NULL = sem preferência (cookie ou navegador). en-US é alias de leitura para en.';
