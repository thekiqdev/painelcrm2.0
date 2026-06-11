import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatSignupPhoneE164, isDisplayableSignupEmail } from '../contact-setup/activationPreviewState';
import { ActivationCtaButton } from './ActivationCtaButton';

type Props = {
  name: string;
  email: string;
  phone: string;
  trialDays: number;
  usersCount: number;
  loading: boolean;
  onContinue: () => void;
  compact?: boolean;
};

function FutureStep({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2.5 text-xs text-muted-foreground">
      <span className="inline-flex h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/35 bg-muted-foreground/15" />
      {label}
    </li>
  );
}

function DoneStep({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2.5 text-xs text-foreground">
      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={2.5} />
      {label}
    </li>
  );
}

/** Sprint E1.3 — tela final antes de iniciar configuração do workspace. */
export function ActivationEnvironmentReady({
  name,
  email,
  phone,
  trialDays,
  usersCount,
  loading,
  onContinue,
  compact = false,
}: Props) {
  const phoneDisplay = formatSignupPhoneE164(phone);
  const emailDisplay = isDisplayableSignupEmail(email) ? email.trim() : email.trim() || '—';
  const adminName = name.trim() || 'Administrador';

  const trialLabel =
    trialDays >= 1
      ? `${trialDays} ${trialDays === 1 ? 'dia' : 'dias'} de avaliação`
      : 'Período de avaliação';

  return (
    <div
      className={cn(
        'animate-in fade-in flex flex-col duration-500 fill-mode-both',
        compact ? 'gap-4' : 'gap-5',
      )}
    >
      <header className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/80">
          Ambiente pronto
        </p>
        <h1
          className={cn(
            'font-display font-semibold tracking-tight text-foreground',
            compact ? 'text-xl' : 'text-2xl',
          )}
        >
          Seu workspace exclusivo está preparado
        </h1>
      </header>

      <section
        className={cn(
          'rounded-2xl border border-white/[0.09] bg-white/[0.02]',
          compact ? 'p-4' : 'p-5',
        )}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Administrador
        </p>
        <p className="mt-2 text-base font-semibold text-foreground">{adminName}</p>
        {phoneDisplay ? (
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">{phoneDisplay}</p>
        ) : null}
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{emailDisplay}</p>
      </section>

      <section
        className={cn(
          'rounded-2xl border border-white/[0.09] bg-white/[0.02]',
          compact ? 'p-4' : 'p-5',
        )}
      >
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Operação inicial
        </p>
        <ul className="flex flex-col gap-2">
          <DoneStep label={trialLabel} />
          <DoneStep label="CRM operacional" />
          <DoneStep
            label={`${usersCount} ${usersCount === 1 ? 'usuário' : 'usuários'}`}
          />
          <DoneStep label="Automações habilitadas" />
        </ul>
      </section>

      <section
        className={cn(
          'rounded-2xl border border-dashed border-white/[0.08] bg-black/20',
          compact ? 'p-4' : 'p-5',
        )}
      >
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Próximos passos
        </p>
        <ul className="flex flex-col gap-2">
          <FutureStep label="Conectar WhatsApp" />
          <FutureStep label="Personalizar empresa" />
          <FutureStep label="Convidar equipe" />
        </ul>
      </section>

      {!compact ? (
        <div className="pt-1">
          <ActivationCtaButton loading={loading} onClick={onContinue} />
        </div>
      ) : null}
    </div>
  );
}
