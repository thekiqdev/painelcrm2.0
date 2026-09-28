import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { superadminPlatformSupportService } from '@/services/platformSupport';
import {
  platformSupportCategoryLabels,
  platformSupportPriorityColors,
  platformSupportPriorityLabels,
  platformSupportStatusColors,
  platformSupportStatusLabels,
  type PlatformSupportMessage,
  type PlatformSupportStatus,
  type PlatformSupportTicket,
} from '@/types/platformSupport';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function SuperAdminPlatformSupportTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<PlatformSupportTicket | null>(null);
  const [messages, setMessages] = useState<PlatformSupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<PlatformSupportStatus>('open');

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await superadminPlatformSupportService.getTicket(id);
      setTicket(data.ticket);
      setMessages(data.messages);
      setStatus(data.ticket.status);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar');
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
      const msg = await superadminPlatformSupportService.postMessage(id, reply.trim());
      setMessages((prev) => [...prev, msg]);
      setReply('');
      setStatus('waiting_customer');
      toast.success('Resposta enviada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar');
    } finally {
      setSending(false);
    }
  };

  const handleStatus = async (next: PlatformSupportStatus) => {
    if (!id) return;
    try {
      const updated = await superadminPlatformSupportService.updateStatus(id, next);
      setTicket(updated);
      setStatus(updated.status);
      toast.success('Status atualizado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao atualizar status');
    }
  };

  if (!id) return null;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Chamado não encontrado.</p>
        <Button asChild variant="link" className="px-0">
          <Link to="/superadmin/platform-support">Voltar</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/superadmin/platform-support">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Suporte
        </Link>
      </Button>

      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge className={platformSupportStatusColors[ticket.status]}>
              {platformSupportStatusLabels[ticket.status]}
            </Badge>
            <Badge variant="outline" className={platformSupportPriorityColors[ticket.priority]}>
              {platformSupportPriorityLabels[ticket.priority]}
            </Badge>
            <Badge variant="secondary">{platformSupportCategoryLabels[ticket.category]}</Badge>
          </div>
          <CardTitle>{ticket.subject}</CardTitle>
          <CardDescription>
            {ticket.tenant_name} · {ticket.created_by_email ?? ticket.created_by_user_id}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] space-y-1">
            <p className="text-xs text-muted-foreground">Status</p>
            <Select value={status} onValueChange={(v) => void handleStatus(v as PlatformSupportStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(platformSupportStatusLabels).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {messages.map((m) => (
          <Card key={m.id} className={m.sender_type === 'superadmin' ? 'border-primary/30' : ''}>
            <CardHeader className="py-3">
              <CardDescription className="text-xs">
                {m.sender_type === 'superadmin' ? 'Suporte' : 'Cliente'}
                {m.sender_email ? ` · ${m.sender_email}` : ''} ·{' '}
                {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: ptBR })}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="whitespace-pre-wrap text-sm">{m.message}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Responder ao cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={handleReply}>
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} required />
            <Button type="submit" disabled={sending}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enviar resposta
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
