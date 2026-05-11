import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Headphones, Loader2, Send, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { PlatformSupportMessage } from '@/types/platformSupport';

type SupportTicketConversationProps = {
  messages: PlatformSupportMessage[];
  reply: string;
  onReplyChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  sending: boolean;
  closed: boolean;
  className?: string;
};

export function SupportTicketConversation({
  messages,
  reply,
  onReplyChange,
  onSubmit,
  sending,
  closed,
  className,
}: SupportTicketConversationProps) {
  return (
    <div className={cn('flex min-h-[50vh] flex-col', className)}>
      <div className="flex-1 space-y-4 pb-4">
        {messages.map((message) => {
          const isCustomer = message.sender_type === 'customer';
          const timestamp = format(new Date(message.created_at), "d MMM, HH:mm", { locale: ptBR });

          return (
            <div
              key={message.id}
              className={cn('flex gap-2.5', isCustomer ? 'justify-end' : 'justify-start')}
            >
              {!isCustomer ? (
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Headphones className="h-4 w-4" aria-hidden />
                </div>
              ) : null}

              <div className={cn('max-w-[min(100%,34rem)] space-y-1', isCustomer ? 'items-end text-right' : 'items-start')}>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/80">
                    {isCustomer ? 'Você' : 'Equipe PainelCRM'}
                  </span>
                  <span>{timestamp}</span>
                </div>
                <div
                  className={cn(
                    'rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-sm',
                    isCustomer
                      ? 'rounded-br-md border-primary/20 bg-primary text-primary-foreground'
                      : 'rounded-bl-md border-border/60 bg-card',
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.message}</p>
                </div>
              </div>

              {isCustomer ? (
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <UserRound className="h-4 w-4" aria-hidden />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {!closed ? (
        <div className="sticky bottom-0 border-t border-border/60 bg-background/95 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <form className="space-y-3" onSubmit={onSubmit}>
            <Textarea
              value={reply}
              onChange={(e) => onReplyChange(e.target.value)}
              rows={4}
              required
              placeholder="Escreva sua resposta…"
              className="min-h-[110px] resize-y"
            />
            <Button type="submit" disabled={sending} className="w-full sm:w-auto">
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Send className="mr-2 h-4 w-4" aria-hidden />}
              Enviar resposta
            </Button>
          </form>
        </div>
      ) : (
        <p className="border-t border-border/60 pt-4 text-sm text-muted-foreground">Este chamado está encerrado.</p>
      )}
    </div>
  );
}
