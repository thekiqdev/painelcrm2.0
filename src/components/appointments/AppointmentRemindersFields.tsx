import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { AppointmentReminderFormState } from '@/lib/appointmentReminders';
import { cn } from '@/lib/utils';

type Props = {
  value: AppointmentReminderFormState;
  onChange: (patch: Partial<AppointmentReminderFormState>) => void;
  disabled?: boolean;
  className?: string;
  /** Texto curto sob o título (ex.: chat vs agenda). */
  description?: string;
  /** Aviso quando o motor de notificações WhatsApp não está pronto. */
  engineDisabledHint?: boolean;
};

export function AppointmentRemindersFields({
  value,
  onChange,
  disabled = false,
  className,
  description = 'Notificações internas no Painel e lembretes ao cliente no WhatsApp nos horários marcados.',
  engineDisabledHint = false,
}: Props) {
  return (
    <div className={cn('space-y-3 rounded-lg border p-3', className)}>
      <div>
        <Label className="text-sm font-medium">Lembretes</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="appt-rem-10"
            checked={value.rem10}
            onCheckedChange={(c) => onChange({ rem10: c === true })}
            disabled={disabled}
          />
          <label htmlFor="appt-rem-10" className="text-sm">
            10 minutos antes
          </label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="appt-rem-30"
            checked={value.rem30}
            onCheckedChange={(c) => onChange({ rem30: c === true })}
            disabled={disabled}
          />
          <label htmlFor="appt-rem-30" className="text-sm">
            30 minutos antes
          </label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="appt-rem-60"
            checked={value.rem60}
            onCheckedChange={(c) => onChange({ rem60: c === true })}
            disabled={disabled}
          />
          <label htmlFor="appt-rem-60" className="text-sm">
            1 hora antes
          </label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="appt-rem-1d"
            checked={value.rem1440}
            onCheckedChange={(c) => onChange({ rem1440: c === true })}
            disabled={disabled}
          />
          <label htmlFor="appt-rem-1d" className="text-sm">
            1 dia antes
          </label>
        </div>
      </div>
      <div className="flex items-start space-x-2 border-t pt-3">
        <Checkbox
          id="appt-rem-client"
          checked={value.sendReminderToClient}
          onCheckedChange={(c) => onChange({ sendReminderToClient: c === true })}
          disabled={disabled}
        />
        <div className="space-y-1">
          <label htmlFor="appt-rem-client" className="text-sm font-medium leading-snug">
            Enviar lembretes ao cliente pelo WhatsApp
          </label>
          <p className="text-xs text-muted-foreground">
            Nos horários selecionados acima, o cliente recebe mensagem automática (motor de notificações).
          </p>
          {engineDisabledHint ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Conecte uma instância WhatsApp e mantenha o motor de notificações ativo para enviar ao cliente.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
