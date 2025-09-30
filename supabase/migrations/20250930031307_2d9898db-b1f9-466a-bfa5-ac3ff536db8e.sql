-- Create contract status enum
CREATE TYPE contract_status AS ENUM (
  'DRAFT',
  'PENDING_SIGNATURE',
  'PARTIALLY_SIGNED',
  'ACTIVE',
  'INACTIVE',
  'EXPIRED',
  'CANCELLED'
);

-- Create contracts table
CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_number TEXT NOT NULL,
  title TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  responsible_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status contract_status NOT NULL DEFAULT 'DRAFT',
  start_date DATE,
  end_date DATE,
  tags JSONB DEFAULT '[]'::jsonb,
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, contract_number)
);

-- Enable RLS
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own contracts"
  ON public.contracts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own contracts"
  ON public.contracts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contracts"
  ON public.contracts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contracts"
  ON public.contracts FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_contracts_user_id ON public.contracts(user_id);
CREATE INDEX idx_contracts_status ON public.contracts(status);
CREATE INDEX idx_contracts_client_id ON public.contracts(client_id);
CREATE INDEX idx_contracts_updated_at ON public.contracts(updated_at DESC);