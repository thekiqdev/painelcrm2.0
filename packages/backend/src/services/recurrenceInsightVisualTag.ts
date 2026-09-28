/** Tag visual do bloco de recorrência (partilhada entre insight e mapeamento de ciclos). */
export type RecurrenceVisualTag =
  | 'not_recurring'
  | 'scheduled'
  | 'processed'
  | 'no_new_invoice'
  | 'failed'
  | 'cancelled'
  | 'stale_after_reschedule';
