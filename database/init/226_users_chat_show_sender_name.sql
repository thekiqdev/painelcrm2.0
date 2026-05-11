-- Prefixo opcional do nome do atendente em mensagens de texto enviadas manualmente pelo chat
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS chat_show_sender_name BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.chat_show_sender_name IS
  'Se true, mensagens de texto enviadas manualmente pelo utilizador podem ser prefixadas com *Nome* (ver envio no chat).';
