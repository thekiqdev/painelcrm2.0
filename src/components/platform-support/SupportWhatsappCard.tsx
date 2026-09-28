import { AlertTriangle, Check, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PlatformSupportPublicSettings } from '@/types/platformSupport';

const benefits = ['Resposta rápida', 'Suporte técnico', 'Ajuda de implantação'] as const;

type SupportWhatsappCardProps = {
  settings: PlatformSupportPublicSettings | null;
  online: boolean;
  className?: string;
};

export function SupportWhatsappCard({ settings, online, className }: SupportWhatsappCardProps) {
  const configured = Boolean(settings?.whatsapp_configured && settings.whatsapp_url);
  const disabled = !configured;

  return (
    <div
      className={cn(
        'flex flex-col rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-shadow hover:shadow-md',
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <MessageCircle className="h-7 w-7" aria-hidden />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Canal prioritário
          </p>
          <h2 className="text-lg font-semibold leading-snug">Atendimento rápido direto com nossa equipe.</h2>
          <p className="text-sm text-muted-foreground">Para dúvidas rápidas recomendamos o WhatsApp.</p>
        </div>
      </div>

      <div className="mt-5 space-y-3 rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Horário</span>
          <span className="font-medium">Seg–Sex, 9h às 18h</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Status</span>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 font-medium',
              online ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground',
            )}
          >
            <span
              className={cn('h-2 w-2 rounded-full', online ? 'bg-emerald-500' : 'bg-muted-foreground/50')}
              aria-hidden
            />
            {online ? 'Online agora' : 'Offline'}
          </span>
        </div>
        {settings?.whatsapp_number_masked ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Número</span>
            <span className="font-medium tabular-nums">{settings.whatsapp_number_masked}</span>
          </div>
        ) : null}
      </div>

      <ul className="mt-5 space-y-2">
        {benefits.map((item) => (
          <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            {item}
          </li>
        ))}
      </ul>

      {disabled ? (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>O WhatsApp da plataforma ainda não está disponível. Use um chamado para falar com a equipe.</p>
        </div>
      ) : (
        <Button asChild className="mt-5 w-full" size="lg">
          <a href={settings!.whatsapp_url!} target="_blank" rel="noopener noreferrer">
            Abrir WhatsApp
          </a>
        </Button>
      )}
    </div>
  );
}
