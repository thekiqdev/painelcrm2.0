import { ImagePlus, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  platformSupportCategoryLabels,
  platformSupportPriorityLabels,
  type PlatformSupportCategory,
  type PlatformSupportPriority,
} from '@/types/platformSupport';
import { platformSupportCategoryIcons } from './supportUi';

export type SupportTicketFormValues = {
  subject: string;
  category: PlatformSupportCategory;
  priority: PlatformSupportPriority;
  message: string;
};

type SupportTicketFormProps = {
  values: SupportTicketFormValues;
  onChange: (patch: Partial<SupportTicketFormValues>) => void;
  onSubmit: (e: React.FormEvent) => void;
  sending: boolean;
  className?: string;
  idPrefix?: string;
  hideHeader?: boolean;
  submitLabel?: string;
  showSubmitButton?: boolean;
};

export function SupportTicketForm({
  values,
  onChange,
  onSubmit,
  sending,
  className,
  idPrefix = 'ps',
  hideHeader = false,
  submitLabel = 'Enviar chamado',
  showSubmitButton = true,
}: SupportTicketFormProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-shadow hover:shadow-md md:p-8',
        className,
      )}
    >
      {!hideHeader ? (
        <div className="mb-6 space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">Abrir chamado</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Abra um chamado e acompanhe respostas diretamente no painel.
          </p>
        </div>
      ) : null}

      <form className="space-y-6" onSubmit={onSubmit} id={`${idPrefix}-form`}>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-subject`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Assunto
          </Label>
          <Input
            id={`${idPrefix}-subject`}
            value={values.subject}
            onChange={(e) => onChange({ subject: e.target.value })}
            required
            maxLength={300}
            className="h-11"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Categoria</Label>
            <Select value={values.category} onValueChange={(v) => onChange({ category: v as PlatformSupportCategory })}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(platformSupportCategoryLabels).map(([key, label]) => {
                  const Icon = platformSupportCategoryIcons[key as PlatformSupportCategory];
                  return (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                        {label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prioridade</Label>
            <Select value={values.priority} onValueChange={(v) => onChange({ priority: v as PlatformSupportPriority })}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(platformSupportPriorityLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    <span
                      className={cn(
                        key === 'urgent' && 'font-medium text-red-600 dark:text-red-400',
                        key === 'high' && 'text-orange-700 dark:text-orange-300',
                        key === 'medium' && 'text-sky-700 dark:text-sky-300',
                        key === 'low' && 'text-muted-foreground',
                      )}
                    >
                      {label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-message`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Mensagem
          </Label>
          <Textarea
            id={`${idPrefix}-message`}
            value={values.message}
            onChange={(e) => onChange({ message: e.target.value })}
            required
            rows={7}
            className="min-h-[160px] resize-y"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Anexar captura de tela</Label>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ImagePlus className="h-4 w-4 shrink-0" aria-hidden />
              Envie prints para agilizar o diagnóstico.
            </div>
            <Badge variant="secondary" className="shrink-0">
              Em breve
            </Badge>
          </div>
        </div>

        {showSubmitButton ? (
          <Button type="submit" disabled={sending} className="h-11 w-full sm:w-auto" size="lg">
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Send className="mr-2 h-4 w-4" aria-hidden />}
            {submitLabel}
          </Button>
        ) : null}
      </form>
    </div>
  );
}
