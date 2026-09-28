import { Mail, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPhoneBrDigits } from '@/lib/brazilInputMasks';
import { useOnboardingSessionAvatar } from '@/hooks/useOnboardingSessionAvatar';

type Props = {
  name: string;
  email: string;
  phone: string;
  className?: string;
};

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return `${p[0][0]}${p[1][0]}`.toUpperCase();
  return (p[0]?.[0] ?? '?').toUpperCase();
}

export function ProvisionMobileProfileStrip({ name, email, phone, className }: Props) {
  const { avatarUrl } = useOnboardingSessionAvatar();
  const displayName = name.trim() || 'Responsável';
  const displayPhone = phone ? formatPhoneBrDigits(phone) : '—';

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5',
        className,
      )}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-primary/10">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm font-semibold text-primary">{initials(displayName)}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
        <div className="mt-0.5 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5 truncate">
            <MessageCircle className="h-3 w-3 shrink-0 text-primary/75" />
            <span className="truncate tabular-nums text-foreground/85">{displayPhone}</span>
          </span>
          <span className="flex items-center gap-1.5 truncate">
            <Mail className="h-3 w-3 shrink-0 text-primary/75" />
            <span className="truncate text-foreground/80">{email}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
