import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { addMinutes } from 'date-fns';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AppointmentRemindersFields } from '@/components/appointments/AppointmentRemindersFields';
import {
  DEFAULT_CHAT_APPOINTMENT_REMINDERS,
  buildAppointmentRemindersPayload,
} from '@/lib/appointmentReminders';
import { localTimeHHmmNow, localWallClockToUtcIso } from '@/lib/appointmentLocalDateTime';
import { chatService } from '@/services/chat';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

export type ChatAppointmentSchedulePanelProps = {
  conversationId: string;
  contactLabel: string;
  onBack: () => void;
  onSuccess?: () => void;
  /** `chat`: painel no /chat; `floating`: barra lateral do chat flutuante. */
  variant?: 'chat' | 'floating';
  className?: string;
};

export function ChatAppointmentSchedulePanel({
  conversationId,
  contactLabel,
  onBack,
  onSuccess,
  variant = 'chat',
  className,
}: ChatAppointmentSchedulePanelProps) {
  const [busy, setBusy] = useState(false);
  const [schedDay, setSchedDay] = useState<Date>(() => new Date());
  const [schedTime, setSchedTime] = useState(() => localTimeHHmmNow());
  const [schedDuration, setSchedDuration] = useState(60);
  const [schedCreateMeet, setSchedCreateMeet] = useState(true);
  const [schedNote, setSchedNote] = useState('');
  const [schedTitle, setSchedTitle] = useState(() => `Atendimento com ${contactLabel}`);
  const [schedReminders, setSchedReminders] = useState(() => ({
    ...DEFAULT_CHAT_APPOINTMENT_REMINDERS,
  }));

  useEffect(() => {
    setSchedDay(new Date());
    setSchedTime(localTimeHHmmNow());
    setSchedDuration(60);
    setSchedCreateMeet(true);
    setSchedNote('');
    setSchedTitle(`Atendimento com ${contactLabel}`);
    setSchedReminders({ ...DEFAULT_CHAT_APPOINTMENT_REMINDERS });
  }, [conversationId, contactLabel]);

  const submit = useCallback(async () => {
    const startsAt = localWallClockToUtcIso(schedDay, schedTime);
    const startCheck = new Date(startsAt);
    if (Number.isNaN(startCheck.getTime())) {
      toast.error('Data ou horário inválido');
      return;
    }
    const endsAt = addMinutes(startCheck, schedDuration).toISOString();

    setBusy(true);
    try {
      const r = await chatService.scheduleAppointmentFromChat(conversationId, {
        title: schedTitle.trim() || `Atendimento com ${contactLabel}`,
        starts_at: startsAt,
        ends_at: endsAt,
        type: 'meeting',
        description: schedNote.trim() || 'Agendado a partir do chat',
        create_google_event: schedCreateMeet,
        create_meet: schedCreateMeet,
        send_chat_confirmation: true,
        reminders: buildAppointmentRemindersPayload(schedReminders),
        send_reminder_to_client: schedReminders.sendReminderToClient,
      });
      if (r.warnings?.length) {
        for (const w of r.warnings) toast.message(w);
      }
      if (r.message_sent) {
        toast.success('Compromisso criado e confirmação enviada no chat.');
      } else {
        toast.warning('Compromisso criado, mas a mensagem não foi enviada no WhatsApp.');
      }
      onSuccess?.();
      onBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao agendar');
    } finally {
      setBusy(false);
    }
  }, [
    conversationId,
    contactLabel,
    schedDay,
    schedTime,
    schedDuration,
    schedCreateMeet,
    schedNote,
    schedTitle,
    schedReminders,
    onBack,
    onSuccess,
  ]);

  const isFloating = variant === 'floating';

  const headerBlock = (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-1',
        isFloating ? 'px-3 pt-2' : 'mb-4 border-b border-border/50 pb-4',
      )}
    >
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1 -ml-2" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
          {isFloating ? 'Voltar' : 'Voltar para conversa'}
        </Button>
      </div>
      <div className={cn(!isFloating && 'mx-auto w-full max-w-md')}>
        <h2 className="text-base font-semibold text-foreground">Agendar compromisso</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {contactLabel.trim() ? (
            <>
              Com <span className="font-medium text-foreground">{contactLabel.trim()}</span>
              {isFloating ? '.' : ' — data e horário no seu fuso local.'}
            </>
          ) : isFloating ? (
            'Data e horário no seu fuso local.'
          ) : (
            'Defina data e horário no seu fuso local.'
          )}
        </p>
      </div>
    </div>
  );

  const formFields = (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`chat-appt-title-${conversationId}`}>Título</Label>
        <Input
          id={`chat-appt-title-${conversationId}`}
          value={schedTitle}
          onChange={(e) => setSchedTitle(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Data</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start font-normal">
              {format(schedDay, 'PPP', { locale: ptBR })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={schedDay} onSelect={(d) => d && setSchedDay(d)} locale={ptBR} />
          </PopoverContent>
        </Popover>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`chat-appt-time-${conversationId}`}>Hora inicial</Label>
          <Input
            id={`chat-appt-time-${conversationId}`}
            type="time"
            value={schedTime}
            onChange={(e) => setSchedTime(e.target.value)}
            step={60}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Duração (min)</Label>
          <Select value={String(schedDuration)} onValueChange={(v) => setSchedDuration(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30</SelectItem>
              <SelectItem value="45">45</SelectItem>
              <SelectItem value="60">60</SelectItem>
              <SelectItem value="90">90</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`chat-appt-meet-${conversationId}`}
          checked={schedCreateMeet}
          onCheckedChange={(c) => setSchedCreateMeet(c === true)}
        />
        <Label htmlFor={`chat-appt-meet-${conversationId}`} className="text-sm font-normal">
          Criar Google Calendar e Meet
        </Label>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`chat-appt-note-${conversationId}`}>Observação (opcional)</Label>
        <Textarea
          id={`chat-appt-note-${conversationId}`}
          value={schedNote}
          onChange={(e) => setSchedNote(e.target.value)}
          rows={2}
        />
      </div>
      <AppointmentRemindersFields
        value={schedReminders}
        onChange={(patch) => setSchedReminders((prev) => ({ ...prev, ...patch }))}
        disabled={busy}
        className={isFloating ? 'p-2.5' : undefined}
      />
    </>
  );

  const submitButton = (
    <Button type="button" className="w-full" disabled={busy} onClick={() => void submit()}>
      {busy ? 'A guardar…' : 'Agendar e notificar'}
    </Button>
  );

  if (isFloating) {
    return (
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-muted/30',
          className,
        )}
      >
        {headerBlock}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2">
          <div className="grid gap-3">{formFields}</div>
        </div>
        <div className="shrink-0 border-t border-border/70 bg-background px-3 py-2.5 shadow-[0_-6px_16px_-4px_rgba(0,0,0,0.12)] dark:shadow-[0_-6px_16px_-4px_rgba(0,0,0,0.45)]">
          {submitButton}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 md:px-6', className)}>
      {headerBlock}
      <div className="mx-auto grid w-full max-w-md gap-4">
        {formFields}
        {submitButton}
      </div>
    </div>
  );
}
