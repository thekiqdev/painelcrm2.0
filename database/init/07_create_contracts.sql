-- Create contracts table
CREATE TABLE IF NOT EXISTS public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  contract_number TEXT NOT NULL,
  title TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  responsible_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status public.contract_status NOT NULL DEFAULT 'DRAFT',
  start_date DATE,
  end_date DATE,
  tags JSONB DEFAULT '[]'::jsonb,
  content TEXT,
  content_html TEXT,
  template_id UUID,
  variables JSONB DEFAULT '{}'::jsonb,
  auto_renew BOOLEAN DEFAULT false,
  renewal_period INTEGER,
  total_value NUMERIC,
  currency TEXT DEFAULT 'BRL',
  linked_proposal_id UUID,
  linked_invoice_id UUID,
  signature_settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, contract_number)
);

-- Create contract_templates table
CREATE TABLE IF NOT EXISTS public.contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  content_html TEXT NOT NULL,
  variables_schema JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add foreign key for contracts.template_id
ALTER TABLE public.contracts 
  ADD CONSTRAINT contracts_template_id_fkey 
  FOREIGN KEY (template_id) 
  REFERENCES public.contract_templates(id) ON DELETE SET NULL;

-- Create contract_signers table
CREATE TABLE IF NOT EXISTS public.contract_signers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('CLIENT', 'INTERNAL')),
  signing_order INTEGER,
  signed_at TIMESTAMPTZ,
  signature_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create contract_events table
CREATE TABLE IF NOT EXISTS public.contract_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_contracts_user_id ON public.contracts(user_id);
CREATE INDEX idx_contracts_status ON public.contracts(status);
CREATE INDEX idx_contracts_client_id ON public.contracts(client_id);
CREATE INDEX idx_contracts_updated_at ON public.contracts(updated_at DESC);
CREATE INDEX idx_contract_templates_user_id ON public.contract_templates(user_id);
CREATE INDEX idx_contract_signers_contract_id ON public.contract_signers(contract_id);
CREATE INDEX idx_contract_events_contract_id ON public.contract_events(contract_id);
CREATE INDEX idx_contract_events_created_at ON public.contract_events(created_at DESC);

-- Create triggers for updated_at
CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contract_templates_updated_at
  BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


