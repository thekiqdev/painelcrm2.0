import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ChatKanbanBoardCard } from '@/services/chatKanban';
import { kanbanCardPhoneLine, kanbanCardTitle } from '@/utils/chatKanbanCardDisplay';

type TimelineEntry = {
  at?: string;
  type?: string;
  label?: string;
  [key: string]: unknown;
};

function parseTimeline(card: ChatKanbanBoardCard): TimelineEntry[] {
  const meta = card.metadata;
  if (!meta || typeof meta !== 'object') return [];
  const raw = (meta as Record<string, unknown>).operational_timeline;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === 'object') as TimelineEntry[];
}

type Props = {
  card: ChatKanbanBoardCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ChatKanbanOpsLeadDialog({ card, open, onOpenChange }: Props) {
  if (!card) return null;

  const title = kanbanCardTitle(card);
  const phone = kanbanCardPhoneLine(card);
  const timeline = parseTimeline(card);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Lead de aquisição — pipeline operacional</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {card.op_lead_email ? (
            <p>
              <span className="text-muted-foreground">Email: </span>
              {card.op_lead_email}
            </p>
          ) : null}
          {phone ? (
            <p>
              <span className="text-muted-foreground">WhatsApp: </span>
              {phone}
            </p>
          ) : null}
          {card.op_lead_source ? (
            <p>
              <span className="text-muted-foreground">Origem: </span>
              {card.op_lead_source}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {card.op_lead_stage ? <Badge variant="outline">{card.op_lead_stage}</Badge> : null}
            {card.op_activation_score ? <Badge variant="secondary">{card.op_activation_score}</Badge> : null}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Timeline operacional</p>
            <ScrollArea className="h-[220px] rounded-md border p-2">
              {timeline.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem eventos registrados ainda.</p>
              ) : (
                <ul className="space-y-2">
                  {[...timeline].reverse().map((ev, i) => (
                    <li key={`${ev.at}-${i}`} className="text-xs border-b border-border/40 pb-2 last:border-0">
                      <div className="font-medium">{String(ev.label ?? ev.type ?? 'evento')}</div>
                      {ev.at ? (
                        <div className="text-muted-foreground tabular-nums">
                          {new Date(String(ev.at)).toLocaleString('pt-BR')}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
