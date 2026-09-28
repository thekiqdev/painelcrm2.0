-- Chatbot Flows S36: CPF/CNPJ no cadastro do lead (mesmo papel de clients.cpf_cnpj).
-- Permite gravar documento via ficha CRM, chat e wait_input.save_to_contact.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT;

COMMENT ON COLUMN public.leads.cpf_cnpj IS 'CPF ou CNPJ do lead (somente dígitos); copiado para o cliente na conversão.';
