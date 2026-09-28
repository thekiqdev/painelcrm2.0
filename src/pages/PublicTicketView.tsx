import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Send, Ticket as TicketIcon } from 'lucide-react';
import { publicApiGet, publicApiPost } from '@/integrations/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { ticketPriorityLabels, ticketStatusLabels } from '@/types/tickets';

type PublicTicketMessage = {
  content: string;
  created_at: string;
  author_role: 'customer' | 'support';
};

type PublicTicketPayload = {
  ok: boolean;
  company?: {
    name?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
  };
  ticket: {
    ticket_number: string;
    subject: string;
    status: string;
    priority: string;
    category_name?: string | null;
    created_at: string;
    updated_at: string;
    can_reply: boolean;
    messages: PublicTicketMessage[];
  };
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function PublicTicketView() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicTicketPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    const response = await publicApiGet<PublicTicketPayload>(`/api/public/tickets/${encodeURIComponent(token)}`);
    if (response.error || !response.data) {
      toast.error(response.error || 'Ticket não encontrado');
      setData(null);
    } else {
      setData(response.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [token]);

  const sendReply = async () => {
    if (!token || !reply.trim()) return;
    setSending(true);
    const response = await publicApiPost<{ ok: boolean; message: PublicTicketMessage }>(
      `/api/public/tickets/${encodeURIComponent(token)}/messages`,
      { message: reply.trim() },
    );
    if (response.error || !response.data?.message) {
      toast.error(response.error || 'Não foi possível enviar a resposta');
    } else {
      setData((prev) =>
        prev
          ? {
              ...prev,
              ticket: {
                ...prev.ticket,
                messages: [...prev.ticket.messages, response.data!.message],
              },
            }
          : prev,
      );
      setReply('');
      toast.success('Resposta enviada');
    }
    setSending(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando ticket...
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Ticket não encontrado</CardTitle>
            <CardDescription>Verifique se o link recebido está completo.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const ticket = data.ticket;
  const statusLabel = ticketStatusLabels[ticket.status as keyof typeof ticketStatusLabels] ?? ticket.status;
  const priorityLabel = ticketPriorityLabels[ticket.priority as keyof typeof ticketPriorityLabels] ?? ticket.priority;

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-6">
      <main className="mx-auto max-w-3xl space-y-4">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <TicketIcon className="h-4 w-4" />
                  {data.company?.name || 'Suporte'}
                </div>
                <CardTitle className="leading-tight">{ticket.subject}</CardTitle>
                <CardDescription className="mt-1">Protocolo {ticket.ticket_number}</CardDescription>
              </div>
              {data.company?.logo_url ? (
                <img src={data.company.logo_url} alt="" className="h-10 w-10 rounded-lg object-contain" />
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge>{statusLabel}</Badge>
              <Badge variant="secondary">{priorityLabel}</Badge>
              {ticket.category_name ? <Badge variant="outline">{ticket.category_name}</Badge> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="space-y-3">
              {ticket.messages.map((message, index) => (
                <div
                  key={`${message.created_at}-${index}`}
                  className={`rounded-2xl border p-3 ${
                    message.author_role === 'customer' ? 'ml-6 bg-primary/5' : 'mr-6 bg-background'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>{message.author_role === 'customer' ? 'Você' : 'Equipe de suporte'}</span>
                    <span>{formatDateTime(message.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                </div>
              ))}
            </div>

            {ticket.can_reply ? (
              <div className="rounded-2xl border bg-muted/20 p-3">
                <Textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Escreva sua resposta..."
                  rows={4}
                />
                <div className="mt-3 flex justify-end">
                  <Button onClick={sendReply} disabled={sending || !reply.trim()}>
                    {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Enviar resposta
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
                Este ticket está encerrado e não aceita novas respostas.
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
