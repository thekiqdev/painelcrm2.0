import { useEffect, useState } from 'react';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { chatService, type ChatScheduledMessageApi } from '@/services/chat';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  /** Se definido, atualiza agendamento existente */
  editing?: ChatScheduledMessageApi | null;
  onSuccess?: () => void;
  /** Mensagens longas: compact no floating */
  density?: 'default' | 'compact';
};

export function ScheduleChatMessageDialog({
  open,
  onOpenChange,
  conversationId,
  editing,
  onSuccess,
  density = 'default',
}: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [day, setDay] = useState<Date>(() => new Date());
  const [time, setTime] = useState('10:00');
  const [internalNote, setInternalNote] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setMsg(editing.message_text ?? '');
      const d = new Date(editing.scheduled_at);
      if (!Number.isNaN(d.getTime())) {
        setDay(d);
        setTime(format(d, 'HH:mm'));
      }
      const note = editing.metadata?.internal_note;
      setInternalNote(typeof note === 'string' ? note : '');
    } else {
      setMsg('');
      setDay(new Date());
      setTime('10:00');
      setInternalNote('');
    }
  }, [open, editing]);

  const submit = async () => {
    if (!conversationId) return;
    const text = msg.trim();
    if (!text) {
      toast.error('Escreva a mensagem');
      return;
    }
    const dayStr = format(day, 'yyyy-MM-dd');
    const startLocal = parse(`${dayStr} ${time}`, 'yyyy-MM-dd HH:mm', new Date());
    if (Number.isNaN(startLocal.getTime())) {
      toast.error('Horário inválido');
      return;
    }
    const minFuture = Date.now() + 5000;
    if (startLocal.getTime() <= minFuture) {
      toast.error('Escolha data e hora no futuro');
      return;
    }
    setBusy(true);
    try {
      if (editing?.id) {
        await chatService.patchConversationScheduledMessage(editing.id, {
          message_text: text,
          scheduled_at: startLocal.toISOString(),
        });
        toast.success('Agendamento atualizado');
      } else {
        await chatService.createConversationScheduledMessage(conversationId, {
          message_text: text,
          scheduled_at: startLocal.toISOString(),
          ...(internalNote.trim() ? { internal_note: internalNote.trim() } : {}),
        });
        toast.success('Mensagem agendada');
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível guardar');
    } finally {
      setBusy(false);
    }
  };

  const compact = density === 'compact';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(compact ? 'sm:max-w-sm' : 'sm:max-w-md')}>
        <DialogHeader>
          <DialogTitle>{editing ? 'Reagendar mensagem' : 'Agendar mensagem'}</DialogTitle>
          <DialogDescription>
            O texto será enviado automaticamente na data indicada. Templates complexos continuam disponíveis no chat
            completo (menu Modelos).
          </DialogDescription>
        </DialogHeader>
        <div className={cn('grid gap-3 py-2', compact && 'gap-2')}>
          <div className="space-y-1.5">
            <Label htmlFor="sched-msg-text">Mensagem</Label>
            <Textarea
              id="sched-msg-text"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              rows={compact ? 3 : 4}
              placeholder="Texto a enviar no WhatsApp…"
              autoComplete="off"
            />
          </div>
          {!editing ? (
            <div className="space-y-1.5">
              <Label htmlFor="sched-msg-note">Observação interna (opcional)</Label>
              <Textarea
                id="sched-msg-note"
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                rows={2}
                placeholder="Visível só na equipa / CRM"
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  {format(day, 'PPP', { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={day} onSelect={(d) => d && setDay(d)} locale={ptBR} />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sched-msg-time">Hora</Label>
            <Input id="sched-msg-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? 'A guardar…' : editing ? 'Guardar' : 'Agendar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
