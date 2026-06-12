import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveCompanyLogoUrl } from './companyLogo';

type Props = {
  companyName: string;
  logoLight: string | null;
  logoDark: string | null;
  liveDraft?: boolean;
  compact?: boolean;
  className?: string;
};

export function OperationalCompanyCard({
  companyName,
  logoLight,
  logoDark,
  liveDraft = false,
  compact = false,
  className,
}: Props) {
  const trimmed = companyName.trim();
  if (!liveDraft && trimmed.length < 2) return null;

  const displayName = trimmed || 'Sua operação';
  const initial = trimmed.charAt(0).toUpperCase() || 'O';
  const logo = resolveCompanyLogoUrl(logoDark, logoLight);

  return (
    <div
      className={cn(
        'rounded-xl border bg-white/[0.025]',
        liveDraft ? 'border-dashed border-white/[0.1]' : 'border-white/[0.08]',
        compact ? 'w-full min-w-0 px-2.5 py-2' : 'w-full min-w-0 px-2.5 py-2.5',
        className,
      )}
    >
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Building2 className="h-3 w-3 text-primary/80" />
        Sua operação
      </p>
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            'flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[hsl(228,32%,5%)] ring-1 ring-white/10',
            compact ? 'h-9 w-9' : 'h-10 w-10',
          )}
        >
          {logo ? (
            <img src={logo} alt="" className="h-full w-full object-contain p-0.5" />
          ) : (
            <span className="text-xs font-bold text-primary">{initial}</span>
          )}
        </div>
        <p
          className={cn(
            'min-w-0 truncate font-semibold',
            compact ? 'text-sm' : 'text-sm',
            trimmed ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {displayName}
        </p>
      </div>
    </div>
  );
}
