import { Building2, Check, Loader2, MessageCircle, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveCompanyLogoUrl } from '@/components/onboarding/wizard/company-step/companyLogo';
import type { WhatsappConnectedProfile } from './useWhatsappOnboardingConnection';

type Props = {
  adminName: string;
  companyName: string;
  logoLight: string | null;
  logoDark: string | null;
  waProfile: WhatsappConnectedProfile;
  teamStepEnabled: boolean;
  finishing: boolean;
  onEnterDashboard: () => void;
};

const STEP_CHECKS = [
  { id: 'company', label: 'Empresa' },
  { id: 'users', label: 'Equipe' },
  { id: 'whatsapp', label: 'Canal' },
] as const;

export function WhatsappActivationComplete({
  adminName,
  companyName,
  logoLight,
  logoDark,
  waProfile,
  teamStepEnabled,
  finishing,
  onEnterDashboard,
}: Props) {
  const logo = resolveCompanyLogoUrl(logoDark, logoLight);
  const displayCompany = companyName.trim() || 'Sua operação';
  const displayAdmin = adminName.trim() || 'Administrador';
  const steps = teamStepEnabled ? STEP_CHECKS : STEP_CHECKS.filter((s) => s.id !== 'users');

  return (
    <div className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500">
      <div className="rounded-xl border border-emerald-500/25 bg-white/[0.035] px-4 py-4 shadow-[0_0_48px_-20px_hsl(142_71%_45%/0.25)] sm:px-5 sm:py-5">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 animate-in zoom-in-50 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 duration-500 fill-mode-both">
            <Check className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground sm:text-lg">Operação ativada com sucesso</h2>
            <p className="text-xs text-muted-foreground sm:text-sm">Seu workspace está pronto para uso.</p>
          </div>
        </div>

        <ul className="mb-4 flex flex-wrap gap-2">
          {steps.map((step, i) => (
            <li
              key={step.id}
              className="animate-in zoom-in-50 flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-2.5 py-1 text-[11px] font-medium text-emerald-400/95 duration-300 fill-mode-both"
              style={{ animationDelay: `${120 + i * 80}ms` }}
            >
              <Check className="h-3 w-3" strokeWidth={2.5} />
              {step.label}
            </li>
          ))}
        </ul>

        <div className="mb-4 space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
          <SummaryRow icon={User} label="Perfil" value={displayAdmin} />
          <SummaryRow
            icon={Building2}
            label="Empresa"
            value={displayCompany}
            logo={logo}
            initial={displayCompany.charAt(0).toUpperCase()}
          />
          <SummaryRow
            icon={MessageCircle}
            label="WhatsApp"
            value={waProfile.connection_name ?? 'Canal conectado'}
            subValue={waProfile.phone ?? waProfile.profile_name ?? undefined}
          />
        </div>

        <Button
          type="button"
          className="h-11 w-full text-sm font-semibold shadow-[0_0_32px_-8px_hsl(var(--primary)/0.55)]"
          disabled={finishing}
          onClick={onEnterDashboard}
        >
          {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Entrar no Dashboard
        </Button>
      </div>
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  subValue,
  logo,
  initial,
}: {
  icon: typeof User;
  label: string;
  value: string;
  subValue?: string;
  logo?: string | null;
  initial?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2">
          {logo !== undefined ? (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[hsl(228,32%,6%)] ring-1 ring-white/10">
              {logo ? (
                <img src={logo} alt="" className="h-full w-full object-contain p-0.5" />
              ) : (
                <span className="text-[10px] font-bold text-primary">{initial ?? 'O'}</span>
              )}
            </div>
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{value}</p>
            {subValue ? <p className="truncate text-xs text-muted-foreground">{subValue}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
