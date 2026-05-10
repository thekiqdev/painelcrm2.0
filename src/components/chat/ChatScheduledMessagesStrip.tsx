import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { chatService, type ChatScheduledMessageApi } from '@/services/chat';
import { ScheduleChatMessageDialog } from '@/components/chat/ScheduleChatMessageDialog';
import { cn } from '@/lib/utils';

export const chatScheduledMessagesQueryKey = (conversationId: string | null) =>
  ['chat-scheduled-messages', conversationId] as const;

type Props = {
  conversationId: string | null;
  density?: 'default' | 'compact';
};

function statusLabel(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'Agendada';
    case 'processing':
      return 'A enviar…';
    default:
      return status;
  }
}

export function ChatScheduledMessagesStrip({ conversationId, density = 'default' }: Props) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<ChatScheduledMessageApi | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: chatScheduledMessagesQueryKey(conversationId),
    queryFn: () =>
      conversationId ? chatService.listConversationScheduledMessages(conversationId, 3) : Promise.resolve([]),
    enabled: Boolean(conversationId),
    staleTime: 15_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: chatScheduledMessagesQueryKey(conversationId) });
  };

  const onCancel = async (row: ChatScheduledMessageApi) => {
    if (!globalThis.confirm(`Cancelar envio agendado para ${format(parseISO(row.scheduled_at), 'dd/MM HH:mm', { locale: ptBR })}?`)) {
      return;
    }
    try {
      await chatService.cancelConversationScheduledMessage(row.id);
      toast.success('Agendamento cancelado');
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível cancelar');
    }
  };

  const compact = density === 'compact';

  if (!conversationId) return null;

  if (isLoading) {
    return (
      <div className={cn('rounded-md border border-dashed border-border/50 bg-muted/10 px-2 py-2', compact && 'py-1.5')}>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mensagens agendadas</p>
        <p className="mt-1 text-[11px] text-muted-foreground">A carregar…</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className={cn('rounded-md border border-dashed border-border/60 bg-muted/15 px-2 py-2', compact && 'py-1.5')}>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mensagens agendadas</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Sem mensagens agendadas.</p>
      </div>
    );
  }

  return (
    <>
      <div className={cn('rounded-md border border-border/50 bg-muted/20 px-2 py-2', compact && 'py-1.5')}>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mensagens agendadas</p>
        <ul className="mt-1.5 space-y-1.5">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-start gap-1.5 rounded-md border border-border/40 bg-background/80 px-1.5 py-1 text-[11px]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground" title={row.message_text}>
                  {(row.message_text || '').slice(0, 72)}
                  {(row.message_text || '').length > 72 ? '…' : ''}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {format(parseISO(row.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} ·{' '}
                  {statusLabel(row.status)}
                </p>
              </div>
              <div className="flex shrink-0 gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Reagendar"
                  aria-label="Reagendar"
                  onClick={() => {
                    setEditing(row);
                    setEditOpen(true);
                  }}
                >
                  <Clock className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  title="Cancelar"
                  aria-label="Cancelar agendamento"
                  onClick={() => void onCancel(row)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <ScheduleChatMessageDialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditing(null);
        }}
        conversationId={conversationId}
        editing={editing}
        density={density}
        onSuccess={invalidate}
      />
    </>
  );
}
