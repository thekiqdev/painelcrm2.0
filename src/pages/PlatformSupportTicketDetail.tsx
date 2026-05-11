import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { SupportCategoryLabel, SupportPriorityBadge, SupportStatusBadge } from '@/components/platform-support/supportUi';
import { SupportTicketConversation } from '@/components/platform-support/SupportTicketConversation';
import { useIsMobile } from '@/hooks/use-mobile';
import { platformSupportService } from '@/services/platformSupport';
import type { PlatformSupportMessage, PlatformSupportTicket } from '@/types/platformSupport';
import { cn } from '@/lib/utils';

export default function PlatformSupportTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const isMobile = useIsMobile();
  const [ticket, setTicket] = useState<PlatformSupportTicket | null>(null);
  const [messages, setMessages] = useState<PlatformSupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await platformSupportService.getTicket(id);
      setTicket(data.ticket);
      setMessages(data.messages);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar chamado');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !reply.trim()) return;
    setSending(true);
    try {
      const msg = await platformSupportService.postMessage(id, reply.trim());
      setMessages((prev) => [...prev, msg]);
      setReply('');
      setTicket((current) => (current ? { ...current, status: 'waiting_support', updated_at: msg.created_at } : current));
      toast.success('Mensagem enviada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar');
    } finally {
      setSending(false);
    }
  };

  if (!id) {
    return <p className="p-6 text-sm text-muted-foreground">Chamado inválido.</p>;
  }

  if (loading) {
    return <SupportTicketDetailSkeleton />;
  }

  if (!ticket) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-sm text-muted-foreground">Chamado não encontrado.</p>
        <Button asChild variant="link" className="mt-2 px-0">
          <Link to="/suporte">Voltar</Link>
        </Button>
      </div>
    );
  }

  const closed = ticket.status === 'closed' || ticket.status === 'resolved';

  return (
    <div className={cn('mx-auto max-w-4xl space-y-4 p-4 pb-10 md:p-8', isMobile && 'px-3')}>
      <header
        className={cn(
          'flex items-center gap-2',
          isMobile && 'sticky top-0 z-20 -mx-3 border-b border-border/60 bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        )}
      >
        <Button asChild variant="ghost" size={isMobile ? 'icon' : 'sm'} className={isMobile ? 'h-9 w-9' : undefined}>
          <Link to="/suporte" aria-label="Voltar para suporte">
            <ArrowLeft className="h-4 w-4" />
            {!isMobile ? <span className="ml-2">Suporte</span> : null}
          </Link>
        </Button>
        {isMobile ? <p className="truncate text-sm font-semibold">{ticket.subject}</p> : null}
      </header>

      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <SupportStatusBadge status={ticket.status} />
          <SupportPriorityBadge priority={ticket.priority} />
          <SupportCategoryLabel category={ticket.category} />
        </div>
        {!isMobile ? <h1 className="mt-3 text-2xl font-semibold tracking-tight">{ticket.subject}</h1> : null}
        <p className="mt-2 text-sm text-muted-foreground">
          Atualizado {formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true, locale: ptBR })}
        </p>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm md:p-6">
        <SupportTicketConversation
          messages={messages}
          reply={reply}
          onReplyChange={setReply}
          onSubmit={handleReply}
          sending={sending}
          closed={closed}
        />
      </section>
    </div>
  );
}

function SupportTicketDetailSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <Skeleton className="h-10 w-32" />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-[420px] w-full rounded-2xl" />
    </div>
  );
}
