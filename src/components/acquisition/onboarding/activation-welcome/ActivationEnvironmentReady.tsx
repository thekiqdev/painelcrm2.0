import type { ReactNode } from 'react';
import { Building2, Check, Mail, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatSignupPhoneE164,
  isDisplayableSignupEmail,
} from '../contact-setup/activationPreviewState';
import { ACTIVATION_WELCOME_GREETING, PREMIUM_WORKSPACE_REVEAL, PROFILE_ROLE_LABEL } from './constants';

type Props = {
  name: string;
  email: string;
  phone: string;
  trialDays: number;
  usersCount: number;
  companyName?: string;
  workspaceSlug?: string;
  avatarPreview?: string | null;
  logoDarkPreview?: string | null;
  compact?: boolean;
};

function adminInitials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return `${p[0][0]}${p[1][0]}`.toUpperCase();
  return (p[0]?.[0] ?? 'A').toUpperCase();
}

function firstNameFrom(fullName: string): string {
  return fullName.trim().split(/\s+/).filter(Boolean)[0] ?? fullName.trim();
}

function Badge({ children, tone = 'primary' }: { children: ReactNode; tone?: 'primary' | 'success' }) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-500/30 bg-emerald-500/[0.12] text-emerald-400'
      : 'border-primary/30 bg-primary/[0.12] text-primary';
  return (
    <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium', toneClass)}>
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/90">
      {children}
    </p>
  );
}

function EnvironmentMiniCard({ title }: { title: string }) {
  return (
    <div className="flex h-11 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
        <Check className="h-3 w-3 text-emerald-400" strokeWidth={2.5} aria-hidden />
      </span>
      <span className="truncate text-[11px] font-medium text-foreground">{title}</span>
    </div>
  );
}

/** Sprint O2.3 — premium workspace reveal (Stripe Atlas / Linear). */
export function ActivationEnvironmentReady({
  name,
  email,
  phone,
  trialDays,
  usersCount,
  companyName,
  workspaceSlug,
  avatarPreview = null,
  logoDarkPreview = null,
  compact = false,
}: Props) {
  const adminName = name.trim() || 'Administrador';
  const welcomeName = firstNameFrom(adminName);
  const operationName = (companyName ?? name).trim() || 'Minha operação';
  const slug = (workspaceSlug ?? '').trim() || 'minha-operacao';
  const workspaceHost = `${slug}.painelcrm.com`;
  const phoneDisplay = formatSignupPhoneE164(phone);
  const emailDisplay = isDisplayableSignupEmail(email) ? email.trim() : email.trim() || null;

  const trialLabel =
    trialDays >= 1
      ? `${trialDays} ${trialDays === 1 ? 'dia' : 'dias'} de avaliação`
      : 'Período de avaliação';

  const environmentItems = [
    'CRM operacional',
    'Canal WhatsApp',
    `${usersCount} ${usersCount === 1 ? 'usuário' : 'usuários'}`,
    trialLabel,
    'Automações habilitadas',
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <header className="shrink-0">
        <h1
          className={cn(
            'font-display font-semibold tracking-tight text-foreground',
            compact ? 'text-[1.35rem] leading-tight' : 'text-[1.65rem] leading-[1.15]',
          )}
        >
          {ACTIVATION_WELCOME_GREETING.title(welcomeName)}
        </h1>
        <p className="mt-1 text-xs leading-snug text-muted-foreground sm:text-[13px]">
          {PREMIUM_WORKSPACE_REVEAL.heroSubtitle}
        </p>
      </header>

      <section
        className={cn(
          'shrink-0 overflow-hidden rounded-xl border border-white/[0.1]',
          'bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-black/30',
          'shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_8px_32px_-16px_rgba(0,0,0,0.5)]',
          compact ? 'p-3' : 'p-4',
        )}
        aria-label="Identidade do workspace"
      >
        <div
          className={cn(
            'grid gap-3',
            compact
              ? 'grid-cols-1'
              : 'grid-cols-1 md:grid-cols-[1fr_auto_1fr]',
          )}
        >
          <div className={cn('min-w-0', compact && 'rounded-lg border border-white/[0.06] bg-black/20 p-3')}>
            <SectionLabel>Workspace</SectionLabel>
            <div className="mt-2 flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                {logoDarkPreview ? (
                  <img src={logoDarkPreview} alt="" className="h-full w-full object-contain p-1.5" />
                ) : (
                  <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{operationName}</p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{workspaceHost}</p>
                <div className="mt-2">
                  <Badge tone="success">Workspace ativo</Badge>
                </div>
              </div>
            </div>
          </div>

          {!compact ? (
            <div className="hidden w-px self-stretch bg-white/[0.08] md:block" aria-hidden />
          ) : null}

          <div className={cn('min-w-0', compact && 'rounded-lg border border-white/[0.06] bg-black/20 p-3')}>
            <SectionLabel>Administrador</SectionLabel>
            <div className="mt-2 flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/25 bg-primary/10">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold text-primary">{adminInitials(adminName)}</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{adminName}</p>
                <div className="mt-1.5">
                  <Badge>{PROFILE_ROLE_LABEL}</Badge>
                </div>
                {phoneDisplay ? (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
                    <Phone className="h-3 w-3 shrink-0 text-primary/60" aria-hidden />
                    <span className="truncate">{phoneDisplay}</span>
                  </p>
                ) : null}
                {emailDisplay ? (
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Mail className="h-3 w-3 shrink-0 text-primary/60" aria-hidden />
                    <span className="truncate">{emailDisplay}</span>
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="min-h-0 shrink-0 space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {PREMIUM_WORKSPACE_REVEAL.environmentTitle}
        </p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {environmentItems.map((item) => (
            <EnvironmentMiniCard key={item} title={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
