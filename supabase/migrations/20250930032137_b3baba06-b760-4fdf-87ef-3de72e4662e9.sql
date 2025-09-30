-- Create contract templates table
CREATE TABLE public.contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  content_html TEXT NOT NULL,
  variables_schema JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create contract signers table
CREATE TABLE public.contract_signers (
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

-- Create contract events table
CREATE TABLE public.contract_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add new columns to contracts table
ALTER TABLE public.contracts
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.contract_templates(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS content_html TEXT,
ADD COLUMN IF NOT EXISTS variables JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS renewal_period INTEGER,
ADD COLUMN IF NOT EXISTS total_value NUMERIC,
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL',
ADD COLUMN IF NOT EXISTS linked_proposal_id UUID,
ADD COLUMN IF NOT EXISTS linked_invoice_id UUID,
ADD COLUMN IF NOT EXISTS signature_settings JSONB DEFAULT '{}'::jsonb;

-- Enable RLS on new tables
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contract_templates
CREATE POLICY "Users can view their own templates"
  ON public.contract_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own templates"
  ON public.contract_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own templates"
  ON public.contract_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own templates"
  ON public.contract_templates FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for contract_signers
CREATE POLICY "Users can view signers of their contracts"
  ON public.contract_signers FOR SELECT
  USING (contract_id IN (SELECT id FROM public.contracts WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage signers of their contracts"
  ON public.contract_signers FOR ALL
  USING (contract_id IN (SELECT id FROM public.contracts WHERE user_id = auth.uid()));

-- RLS Policies for contract_events
CREATE POLICY "Users can view events of their contracts"
  ON public.contract_events FOR SELECT
  USING (contract_id IN (SELECT id FROM public.contracts WHERE user_id = auth.uid()));

CREATE POLICY "Users can create events for their contracts"
  ON public.contract_events FOR INSERT
  WITH CHECK (contract_id IN (SELECT id FROM public.contracts WHERE user_id = auth.uid()));

-- Create trigger for contract_templates updated_at
CREATE TRIGGER update_contract_templates_updated_at
  BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes
CREATE INDEX idx_contract_templates_user_id ON public.contract_templates(user_id);
CREATE INDEX idx_contract_signers_contract_id ON public.contract_signers(contract_id);
CREATE INDEX idx_contract_events_contract_id ON public.contract_events(contract_id);
CREATE INDEX idx_contract_events_created_at ON public.contract_events(created_at DESC);