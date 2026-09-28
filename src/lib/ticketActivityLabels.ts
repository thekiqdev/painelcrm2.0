import type { TicketActivity, TicketStatus } from '@/types/tickets';
import { ticketStatusLabels } from '@/types/tickets';

export function formatTicketActivity(activity: TicketActivity & { user?: { email?: string } | null }): string {
  const who = activity.user?.email ?? 'Sistema';
  const changes = activity.changes as Record<string, unknown> | null | undefined;
  const meta = activity.metadata as Record<string, unknown> | null | undefined;

  switch (activity.activity_type) {
    case 'status_changed': {
      const from = changes?.from as TicketStatus | undefined;
      const to = changes?.to as TicketStatus | undefined;
      const fromLabel = from ? ticketStatusLabels[from] ?? from : '—';
      const toLabel = to ? ticketStatusLabels[to] ?? to : '—';
      return `${who} alterou o status de ${fromLabel} para ${toLabel}`;
    }
    case 'lead_converted_to_client':
      return `${who} vinculou o ticket ao cliente após conversão do lead`;
    default:
      if (meta?.message && typeof meta.message === 'string') return `${who}: ${meta.message}`;
      return `${who}: ${activity.activity_type.replace(/_/g, ' ')}`;
  }
}
