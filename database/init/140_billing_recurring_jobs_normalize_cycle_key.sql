-- Normaliza cycle_key legado (texto com sufixo ISO `T…`) para canónico YYYY-MM-DD,
-- alinhado a subscriptions.next_billing_date e ao UNIQUE(subscription_id, cycle_key).

-- 1) Atualizar ISO → YYYY-MM-DD quando não existe outra linha com o canónico.
UPDATE public.billing_recurring_jobs br
SET cycle_key = left(trim(cycle_key), 10)
WHERE trim(cycle_key) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
  AND length(trim(cycle_key)) > 10
  AND NOT EXISTS (
    SELECT 1 FROM public.billing_recurring_jobs o
    WHERE o.subscription_id = br.subscription_id
      AND o.cycle_key = left(trim(br.cycle_key), 10)
      AND o.id <> br.id
  );

-- 2) Duplicata activa: canónico + ISO para o mesmo dia — cancelar o job com chave ISO.
UPDATE public.billing_recurring_jobs br_iso
SET status = 'cancelled',
    completion_outcome = 'cancelled_job_cycle_mismatch_after_reschedule',
    completion_detail = '{"reason":"dedupe_legacy_iso_cycle_key_same_logical_day","note":"superseded_by_canonical_cycle_key_row"}',
    updated_at = now()
WHERE trim(br_iso.cycle_key) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
  AND length(trim(br_iso.cycle_key)) > 10
  AND br_iso.status IN ('pending', 'processing')
  AND EXISTS (
    SELECT 1 FROM public.billing_recurring_jobs c
    WHERE c.subscription_id = br_iso.subscription_id
      AND c.cycle_key = left(trim(br_iso.cycle_key), 10)
      AND c.id <> br_iso.id
      AND c.status IN ('pending', 'processing')
  );

-- 3) Normalizar novamente ISO remanescentes (ex.: duplicata já cancelada).
UPDATE public.billing_recurring_jobs br
SET cycle_key = left(trim(cycle_key), 10)
WHERE trim(cycle_key) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
  AND length(trim(cycle_key)) > 10
  AND NOT EXISTS (
    SELECT 1 FROM public.billing_recurring_jobs o
    WHERE o.subscription_id = br.subscription_id
      AND o.cycle_key = left(trim(br.cycle_key), 10)
      AND o.id <> br.id
  );

COMMENT ON COLUMN public.billing_recurring_jobs.cycle_key IS
  'Dia lógico do ciclo em YYYY-MM-DD (texto). Legado histórico: valores com sufixo ISO; migração 140 normaliza.';
