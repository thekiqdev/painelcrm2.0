import type { ReactNode } from 'react';
import { Check, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActivationProfileCard } from '@/components/acquisition/onboarding/activation-welcome';
import { PROFILE_ROLE_LABEL } from '@/components/acquisition/onboarding/activation-welcome/constants';
import { resolveCompanyLogoUrl } from '@/components/onboarding/wizard/company-step/companyLogo';
import { useOnboardingSessionAvatar } from '@/hooks/useOnboardingSessionAvatar';
import { chatAvatarUrlForImgSrc } from '@/lib/chatAvatarUrl';
import { formatWhatsappDisplayPhone } from '@/lib/whatsappInstanceProfile';
import { cn } from '@/lib/utils';

export type OperationReadyWhatsapp = {
  connected: boolean;
  skipped?: boolean;
  connectionName?: string | null;
  phone?: string | null;
  profileName?: string | null;
  profilePictureUrl?: string | null;
};

type Props = {
  adminName: string;
  adminEmail: string;
  adminPhone: string | null;
  companyName: string;
  logoLight: string | null;
  logoDark: string | null;
  whatsapp: OperationReadyWhatsapp;
  loading?: boolean;
  onAccessDashboard: () => void;
};

const PILLAR_SHELL =
  'flex min-h-[7.5rem] items-center rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]';

function formatInternationalPhone(raw: string | null | undefined): string {
  if (!raw?.trim()) return '—';
  const formatted = formatWhatsappDisplayPhone(raw);
  return formatted.replace(/^\+55 (\d{2}) /, '+55 ($1) ');
}

function whatsappDisplayInitial(name: string): string {
  const n = name.trim();
  if (n.length >= 2) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  return 'WA';
}

function resolveWhatsappCardCopy(whatsapp: OperationReadyWhatsapp) {
  const connectionLabel = whatsapp.connectionName?.trim() || 'WhatsApp Comercial';
  const accountName = whatsapp.profileName?.trim() || null;

  return {
    connectionLabel,
    accountName,
    phoneFormatted: formatInternationalPhone(whatsapp.phone),
    avatarLabel: accountName ?? connectionLabel,
  };
}

function ReadyPillarLabel({ children }: { children: string }) {
  return (
    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground lg:text-left">
      {children}
    </p>
  );
}

function ReadyPillarShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(PILLAR_SHELL, 'h-full w-full', className)}>{children}</div>;
}

function ReadyCompanyRow({
  companyName,
  logoLight,
  logoDark,
}: {
  companyName: string;
  logoLight: string | null;
  logoDark: string | null;
}) {
  const displayName = companyName.trim() || 'Sua operação';
  const initial = displayName.charAt(0).toUpperCase() || 'O';
  const logo = resolveCompanyLogoUrl(logoDark, logoLight);

  return (
    <div className="flex w-full min-w-0 items-center gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[hsl(228,32%,5%)] ring-1 ring-white/10">
        {logo ? (
          <img src={logo} alt="" className="h-full w-full object-contain p-0.5" />
        ) : (
          <span className="text-sm font-bold text-primary">{initial}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Workspace configurado</p>
      </div>
    </div>
  );
}

function adminInitials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return `${p[0][0]}${p[1][0]}`.toUpperCase();
  return (p[0]?.[0] ?? 'A').toUpperCase();
}

function MobileSummaryThumb({
  src,
  initial,
  shape = 'circle',
  className,
}: {
  src: string | null;
  initial: string;
  shape?: 'circle' | 'rounded';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden ring-1 ring-white/10',
        shape === 'circle' ? 'rounded-full bg-primary/10' : 'rounded-lg bg-[hsl(228,32%,5%)]',
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className={cn(
            'h-full w-full',
            shape === 'rounded' ? 'object-contain p-0.5' : 'object-cover',
          )}
        />
      ) : shape === 'rounded' ? (
        <span className="text-xs font-bold text-primary">{initial}</span>
      ) : (
        <span className="text-xs font-semibold text-primary">{initial}</span>
      )}
    </div>
  );
}

function MobileOperationSummaryCard({
  adminName,
  companyName,
  logoLight,
  logoDark,
  whatsapp,
}: {
  adminName: string;
  companyName: string;
  logoLight: string | null;
  logoDark: string | null;
  whatsapp: OperationReadyWhatsapp;
}) {
  const { avatarUrl } = useOnboardingSessionAvatar();
  const displayAdmin = adminName.trim() || 'Administrador';
  const displayCompany = companyName.trim() || 'Sua operação';
  const companyLogo = resolveCompanyLogoUrl(logoDark, logoLight);
  const companyInitial = displayCompany.charAt(0).toUpperCase() || 'O';
  const { connectionLabel, accountName, phoneFormatted, avatarLabel } = resolveWhatsappCardCopy(whatsapp);
  const waAvatarSrc = chatAvatarUrlForImgSrc(whatsapp.profilePictureUrl);
  const waInitial = whatsappDisplayInitial(avatarLabel);

  return (
    <div className="divide-y divide-white/[0.07] rounded-xl border border-white/[0.1] bg-white/[0.025] shadow-[0_0_32px_-20px_hsl(var(--primary)/0.25)]">
      <MobileSummarySection title="Administrador">
        <div className="flex items-center gap-2.5">
          <MobileSummaryThumb src={avatarUrl} initial={adminInitials(displayAdmin)} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{displayAdmin}</p>
            <p className="text-[11px] text-muted-foreground">{PROFILE_ROLE_LABEL}</p>
          </div>
        </div>
      </MobileSummarySection>

      <MobileSummarySection title="Empresa">
        <div className="flex items-center gap-2.5">
          <MobileSummaryThumb src={companyLogo} initial={companyInitial} shape="rounded" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{displayCompany}</p>
          </div>
        </div>
      </MobileSummarySection>

      <MobileSummarySection title="WhatsApp">
        {whatsapp.skipped ? (
          <div className="flex items-center gap-2.5">
            <MobileSummaryThumb src={null} initial="WA" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Conexão adiada</p>
              <p className="text-[11px] text-muted-foreground">Configure depois no CRM</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <MobileSummaryThumb
              src={waAvatarSrc}
              initial={waInitial}
              className={waAvatarSrc ? 'ring-emerald-500/30' : 'bg-emerald-500/10 ring-emerald-500/20'}
            />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="truncate text-sm font-semibold text-foreground">{connectionLabel}</p>
              {accountName ? (
                <p className="truncate text-[11px] text-muted-foreground">{accountName}</p>
              ) : null}
              {whatsapp.phone ? (
                <p className="font-mono text-[11px] tabular-nums text-foreground/85">{phoneFormatted}</p>
              ) : null}
              {whatsapp.connected ? (
                <p className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400/95">
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                  Conectado
                </p>
              ) : null}
            </div>
          </div>
        )}
      </MobileSummarySection>
    </div>
  );
}

function MobileSummarySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-3 py-2.5">
      <p className="mb-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground/90">
        {title}
      </p>
      {children}
    </div>
  );
}

export function OperationReadyStep({
  adminName,
  adminEmail,
  adminPhone,
  companyName,
  logoLight,
  logoDark,
  whatsapp,
  loading = false,
  onAccessDashboard,
}: Props) {
  const displayAdmin = adminName.trim() || 'Administrador';

  return (
    <div className="mx-auto w-full max-w-md space-y-3 lg:relative lg:left-1/2 lg:w-[min(56rem,calc(100vw-2rem))] lg:max-w-none lg:-translate-x-1/2 lg:space-y-10">
      <header className="animate-in fade-in fill-mode-both px-1 py-1 text-center duration-500 max-lg:shrink-0 lg:px-2 lg:py-8">
        <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 shadow-[0_0_40px_-14px_hsl(142_71%_45%/0.4)] lg:mb-5 lg:h-16 lg:w-16 lg:rounded-2xl">
          <Check className="h-6 w-6 lg:h-8 lg:w-8" strokeWidth={2.5} />
        </div>
        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground lg:text-[1.65rem]">
          Operação ativada com sucesso
        </h2>
        <p className="mx-auto mt-1 max-w-md text-xs leading-snug text-muted-foreground lg:mt-3 lg:text-[15px] lg:leading-relaxed">
          <span className="lg:hidden">Workspace pronto. Acesse o PainelCRM.</span>
          <span className="hidden lg:inline">
            Seu workspace está pronto para uso.
            <br className="hidden sm:inline" />
            <span className="sm:ml-1">Agora você já pode acessar o PainelCRM.</span>
          </span>
        </p>
      </header>

      <div className="animate-in fade-in fill-mode-both duration-500 lg:hidden">
        <MobileOperationSummaryCard
          adminName={displayAdmin}
          companyName={companyName}
          logoLight={logoLight}
          logoDark={logoDark}
          whatsapp={whatsapp}
        />
      </div>

      {/* —— Desktop —— */}
      <section
        className="hidden animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 lg:block"
        style={{ animationDelay: '80ms' }}
        aria-labelledby="ready-summary-heading"
      >
        <p
          id="ready-summary-heading"
          className="mb-4 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/90"
        >
          Resumo da operação
        </p>

        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col" aria-labelledby="ready-profile-label">
            <ReadyPillarLabel>
              <span id="ready-profile-label">Perfil</span>
            </ReadyPillarLabel>
            <ReadyPillarShell>
              <ActivationProfileCard
                name={adminName}
                email={adminEmail}
                phone={adminPhone ?? ''}
                compact
                allowUpload={false}
                showBadges={false}
                className="w-full max-w-none flex-1 border-0 bg-transparent p-0 shadow-none max-lg:mx-0"
              />
            </ReadyPillarShell>
          </div>

          <div className="flex flex-col" aria-labelledby="ready-company-label">
            <ReadyPillarLabel>
              <span id="ready-company-label">Empresa</span>
            </ReadyPillarLabel>
            <ReadyPillarShell>
              <ReadyCompanyRow companyName={companyName} logoLight={logoLight} logoDark={logoDark} />
            </ReadyPillarShell>
          </div>

          <div className="flex flex-col" aria-labelledby="ready-whatsapp-label">
            <ReadyPillarLabel>
              <span id="ready-whatsapp-label">WhatsApp</span>
            </ReadyPillarLabel>
            <ReadyPillarShell className="border-emerald-500/15 bg-white/[0.03]">
              <OperationReadyWhatsappCard whatsapp={whatsapp} layout="horizontal" />
            </ReadyPillarShell>
          </div>
        </div>
      </section>

      <div
        className="animate-in zoom-in-95 hidden fill-mode-both duration-400 lg:block"
        style={{ animationDelay: '300ms' }}
      >
        <Button
          type="button"
          className="h-11 w-full text-sm font-semibold shadow-[0_0_32px_-8px_hsl(var(--primary)/0.55)]"
          disabled={loading}
          onClick={onAccessDashboard}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Acessar Dashboard
        </Button>
      </div>
    </div>
  );
}

function OperationReadyWhatsappCard({
  whatsapp,
  layout,
  className,
}: {
  whatsapp: OperationReadyWhatsapp;
  layout: 'horizontal' | 'hero';
  className?: string;
}) {
  if (whatsapp.skipped) {
    if (layout === 'hero') {
      return (
        <div className={cn('flex flex-col items-center px-4 py-6 text-center', className)}>
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-white/10">
            <MessageCircle className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">Conexão adiada</p>
          <p className="mt-1 text-xs text-muted-foreground">Configure o canal depois no CRM.</p>
        </div>
      );
    }
    return (
      <div className={cn('flex w-full min-w-0 items-center gap-3', className)}>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-white/10">
          <MessageCircle className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Conexão adiada</p>
          <p className="text-xs text-muted-foreground">Configure depois no CRM.</p>
        </div>
      </div>
    );
  }

  const { connectionLabel, accountName, phoneFormatted, avatarLabel } = resolveWhatsappCardCopy(whatsapp);
  const avatarSrc = chatAvatarUrlForImgSrc(whatsapp.profilePictureUrl);
  const initial = whatsappDisplayInitial(avatarLabel);
  const isHero = layout === 'hero';

  const avatarSize = isHero ? 'h-16 w-16' : 'h-12 w-12';
  const displayTitle = accountName ?? connectionLabel;
  const showConnectionLine = Boolean(accountName);

  const avatarNode = (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-2',
        avatarSize,
        avatarSrc ? 'ring-emerald-500/35' : 'bg-emerald-500/10 ring-emerald-500/25',
      )}
    >
      {avatarSrc ? (
        <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className={cn('font-semibold text-emerald-400/95', isHero ? 'text-xl' : 'text-sm')}>
          {initial}
        </span>
      )}
    </div>
  );

  const textBlock = (
    <div className={cn('min-w-0 flex-1 space-y-0.5', isHero && 'text-center')}>
      <p className={cn('font-semibold text-foreground', isHero ? 'text-base' : 'text-sm leading-snug')}>
        {isHero ? displayTitle : connectionLabel}
      </p>
      {isHero && showConnectionLine ? (
        <p className="text-xs text-muted-foreground">{connectionLabel}</p>
      ) : null}
      {!isHero && accountName ? (
        <p className="truncate text-xs text-muted-foreground">{accountName}</p>
      ) : null}
      {whatsapp.phone ? (
        <p className={cn('font-mono tabular-nums text-foreground/90', isHero ? 'text-sm' : 'text-xs')}>
          {phoneFormatted}
        </p>
      ) : null}
      {whatsapp.connected ? (
        <p
          className={cn(
            'inline-flex items-center gap-1 font-medium text-emerald-400/95',
            isHero ? 'justify-center pt-1 text-xs' : 'text-[11px]',
          )}
        >
          <Check className="h-3 w-3" strokeWidth={2.5} />
          Conectado
        </p>
      ) : null}
    </div>
  );

  if (isHero) {
    return (
      <div className={cn('flex flex-col items-center gap-3 px-4 py-5', className)}>
        {avatarNode}
        {textBlock}
      </div>
    );
  }

  return (
    <div className={cn('flex w-full min-w-0 items-center gap-3', className)}>
      {avatarNode}
      {textBlock}
    </div>
  );
}
