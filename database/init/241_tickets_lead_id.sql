-- Tickets: vínculo opcional a lead (portal público / matching telefone)
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS lead_id UUID NULL REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_lead_id ON public.tickets(lead_id);
