-- Sprint K8.2 — um único card ativo por acquisition_lead (global).

-- Auto-correção de duplicados existentes antes do índice único.
WITH ranked AS (
  SELECT
    kc.id,
    ROW_NUMBER() OVER (
      PARTITION BY kc.acquisition_lead_id
      ORDER BY
        (
          SELECT COUNT(*)
          FROM public.chat_kanban_scheduled_moves sm
          WHERE sm.card_id = kc.id
            AND sm.status = 'scheduled'
        ) DESC,
        kc.updated_at DESC NULLS LAST,
        kc.created_at DESC NULLS LAST,
        kc.id ASC
    ) AS rn
  FROM public.chat_kanban_cards kc
  WHERE kc.acquisition_lead_id IS NOT NULL
    AND kc.archived_at IS NULL
)
UPDATE public.chat_kanban_cards kc
SET archived_at = now(),
    updated_at = now()
FROM ranked r
WHERE kc.id = r.id
  AND r.rn > 1;

-- Cancela agendamentos de cards arquivados pela correção acima.
UPDATE public.chat_kanban_scheduled_moves sm
SET status = 'cancelled',
    cancelled_reason = 'duplicate_card_archived_migration',
    updated_at = now()
WHERE sm.status = 'scheduled'
  AND sm.card_id IN (
    SELECT kc.id
    FROM public.chat_kanban_cards kc
    WHERE kc.acquisition_lead_id IS NOT NULL
      AND kc.archived_at IS NOT NULL
      AND kc.updated_at >= now() - interval '5 minutes'
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_kanban_cards_single_active_acquisition_lead
  ON public.chat_kanban_cards (acquisition_lead_id)
  WHERE acquisition_lead_id IS NOT NULL AND archived_at IS NULL;

COMMENT ON INDEX public.uq_chat_kanban_cards_single_active_acquisition_lead IS
  'Sprint K8.2 — no máximo um card ativo por acquisition_lead em todos os boards Ops.';
