-- Observação de texto no cadastro de lead e de cliente.
-- notes continua sendo as anotações adesivas (JSON). Texto solto antigo em notes é copiado para observacao.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS observacao TEXT;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS observacao TEXT;

COMMENT ON COLUMN public.leads.observacao IS 'Texto do campo Observação no cadastro do lead. notes guarda anotações adesivas.';
COMMENT ON COLUMN public.clients.observacao IS 'Texto do campo Observação no cadastro do cliente. notes guarda anotações adesivas.';

UPDATE public.leads
SET observacao = notes
WHERE observacao IS NULL
  AND notes IS NOT NULL
  AND btrim(notes) <> ''
  AND left(btrim(notes), 1) NOT IN ('[', '{');

UPDATE public.clients
SET observacao = notes
WHERE observacao IS NULL
  AND notes IS NOT NULL
  AND btrim(notes) <> ''
  AND left(btrim(notes), 1) NOT IN ('[', '{');
