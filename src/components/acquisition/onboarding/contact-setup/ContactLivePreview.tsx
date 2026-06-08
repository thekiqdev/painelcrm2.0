import { useEffect, useState } from 'react';
import { Mail, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPhoneBrDigits } from '@/lib/brazilInputMasks';
import { CONTACT_ENABLED_RESOURCES } from './contactSetupConstants';

export type ContactPreviewState = {
  name: string;
  email: string;
  phone: string;
};

type Props = {
  preview: ContactPreviewState;
  compact?: boolean;
};

function displayName(name: string): string {
  const t = name.trim();
  return t || 'Seu nome';
}

function displayEmail(email: string): string {
  const t = email.trim();
  return t || 'voce@empresa.com';
}

function displayPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return '(00) 00000-0000';
  return formatPhoneBrDigits(digits);
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return `${p[0][0]}${p[1][0]}`.toUpperCase();
  return (p[0]?.[0] ?? '?').toUpperCase();
}

export function ContactLivePreview({ preview, compact = false }: Props) {
  const [pulse, setPulse] = useState(false);
  const hasIdentity =
    preview.name.trim().length > 0 ||
    preview.email.trim().length > 0 ||
    preview.phone.replace(/\D/g, '').length >= 10;

  useEffect(() => {
    const id = window.setInterval(() => setPulse((p) => !p), 2600);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.09]',
        'bg-gradient-to-b from-white/[0.05] to-white/[0.02] backdrop-blur-xl',
        compact ? 'p-3.5' : 'p-4',
        !compact && 'shadow-[0_0_64px_-24px_hsl(var(--primary)/0.45)]',
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/12 blur-[48px]"
        aria-hidden
      />

      <div className="relative mb-3 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Preview do acesso
        </p>
        <span className="relative flex h-2 w-2">
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full bg-emerald-400/50',
              pulse && hasIdentity && 'animate-ping opacity-60',
            )}
          />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]" />
        </span>
      </div>

      <div
        className={cn(
          'relative rounded-xl border border-white/[0.08] bg-black/25',
          compact ? 'px-3 py-3' : 'px-4 py-4',
          hasIdentity && 'border-primary/20 shadow-[0_0_32px_-16px_hsl(var(--primary)/0.35)]',
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary',
              compact ? 'h-11 w-11 text-sm' : 'h-12 w-12 text-base',
            )}
          >
            {initials(preview.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn('truncate font-semibold text-foreground', compact ? 'text-sm' : 'text-base')}>
              {displayName(preview.name)}
            </p>
            <p className="text-[11px] text-muted-foreground">Administrador inicial</p>
          </div>
        </div>

        <dl className={cn('mt-3 space-y-2', compact ? 'text-[11px]' : 'text-xs')}>
          <div className="flex items-center gap-2 text-muted-foreground">
            <MessageCircle className="h-3.5 w-3.5 shrink-0 text-primary/80" />
            <dd className="truncate font-medium tabular-nums text-foreground">
              {displayPhone(preview.phone)}
            </dd>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="h-3.5 w-3.5 shrink-0 text-primary/80" />
            <dd className="truncate font-medium text-foreground">{displayEmail(preview.email)}</dd>
          </div>
        </dl>
      </div>

      {!compact ? (
        <div className="relative mt-4 space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Habilitado após ativação
          </p>
          <ul className="flex flex-col gap-1.5">
            {CONTACT_ENABLED_RESOURCES.map((item) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.label}
                  className="flex items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2 text-xs text-foreground/88"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-primary/85" strokeWidth={2} />
                  {item.label}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="relative mt-3 flex flex-wrap gap-1.5">
          {CONTACT_ENABLED_RESOURCES.slice(0, 3).map((item) => {
            const Icon = item.icon;
            return (
              <span
                key={item.label}
                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                <Icon className="h-3 w-3 text-primary/80" />
                {item.label.split(' ')[0]}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
