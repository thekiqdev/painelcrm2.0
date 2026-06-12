import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOnboardingSessionAvatar } from '@/hooks/useOnboardingSessionAvatar';
import { formatPhoneBrDigits } from '@/lib/brazilInputMasks';
import { prepareOnboardingAvatarDataUrl } from '@/lib/onboardingAvatarImage';
import { toast } from '@/components/ui/sonner';
import { PROFILE_ROLE_LABEL, PROFILE_STATUS_BADGES } from './constants';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024;

const BADGE_TONE: Record<(typeof PROFILE_STATUS_BADGES)[number]['tone'], string> = {
  primary: 'border-primary/25 bg-primary/10 text-primary',
  success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400/90',
  neutral: 'border-white/10 bg-white/[0.03] text-muted-foreground',
};

type Props = {
  name: string;
  email: string;
  phone: string;
  compact?: boolean;
  allowUpload?: boolean;
  showBadges?: boolean;
  className?: string;
};

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return `${p[0][0]}${p[1][0]}`.toUpperCase();
  return (p[0]?.[0] ?? '?').toUpperCase();
}

export function ActivationProfileCard({
  name,
  email,
  phone,
  compact = false,
  allowUpload = true,
  showBadges = !compact,
  className,
}: Props) {
  const { avatarUrl, setAvatarUrl } = useOnboardingSessionAvatar();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const onFile = useCallback(
    async (file: File) => {
      if (!allowUpload || uploadingAvatar) return;
      if (!ACCEPTED.includes(file.type)) {
        toast.error('Use PNG, JPEG ou WebP.');
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error('Imagem muito grande. Use um arquivo de até 8 MB.');
        return;
      }
      setUploadingAvatar(true);
      try {
        const url = await prepareOnboardingAvatarDataUrl(file);
        if (!url) {
          toast.error('Não foi possível processar a imagem. Tente outra foto.');
          return;
        }
        setAvatarUrl(url);
      } catch {
        toast.error('Não foi possível processar a imagem.');
      } finally {
        setUploadingAvatar(false);
      }
    },
    [allowUpload, setAvatarUrl, uploadingAvatar],
  );

  const displayPhone = phone ? formatPhoneBrDigits(phone) : '—';
  const displayName = name.trim() || 'Responsável';
  const isSocial = !compact;

  const avatarSize = compact
    ? 'h-12 w-12'
    : 'h-20 w-20 lg:h-16 lg:w-16';

  const avatarNode = allowUpload ? (
    <label
      className={cn(
        'group relative flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 transition-all',
        avatarSize,
        avatarUrl
          ? 'border-primary/35 border-solid shadow-[0_0_32px_-10px_hsl(var(--primary)/0.45)] lg:shadow-none'
          : 'border-dashed border-white/18 bg-white/[0.03] hover:border-primary/30',
      )}
    >
      {avatarUrl ? (
        <>
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[9px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            Alterar
          </span>
        </>
      ) : (
        <Plus className="h-5 w-5 text-primary/85" strokeWidth={2.5} />
      )}
      <input
        type="file"
        accept={ACCEPTED.join(',')}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </label>
  ) : (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-primary/10',
        avatarSize,
      )}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-lg font-semibold text-primary lg:text-sm">{initials(displayName)}</span>
      )}
    </div>
  );

  const badges = showBadges ? (
    <div
      className={cn(
        'flex flex-wrap gap-1',
        isSocial && 'mt-2 justify-center lg:mt-2 lg:justify-start',
      )}
    >
      {PROFILE_STATUS_BADGES.map((badge) => (
        <span
          key={badge.id}
          className={cn(
            'inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-medium leading-none lg:text-[9px]',
            BADGE_TONE[badge.tone],
            isSocial && 'max-lg:px-2 max-lg:py-0.5 max-lg:text-[8px]',
          )}
        >
          {badge.label}
        </span>
      ))}
    </div>
  ) : null;

  return (
    <div
      className={cn(
        'rounded-xl border border-white/[0.08] bg-white/[0.025]',
        compact ? 'w-full min-w-0 px-2.5 py-2' : 'px-4 py-4 lg:py-3.5',
        !compact && 'max-w-md max-lg:mx-auto max-lg:max-w-sm max-lg:border-none max-lg:bg-transparent max-lg:px-0',
        className,
      )}
    >
      <div
        className={cn(
          'flex gap-3',
          isSocial
            ? 'flex-col items-center text-center lg:flex-row lg:items-start lg:text-left'
            : 'items-start',
        )}
      >
        {avatarNode}
        <div className={cn('min-w-0 flex-1', isSocial && 'w-full lg:w-auto')}>
          <h2
            className={cn(
              'truncate font-display font-semibold tracking-tight text-foreground',
              compact ? 'text-sm' : 'text-xl lg:text-lg',
            )}
          >
            {displayName}
          </h2>
          <p
            className={cn(
              'text-muted-foreground',
              compact ? 'text-[10px]' : 'text-sm lg:text-xs',
            )}
          >
            {PROFILE_ROLE_LABEL}
          </p>

          {badges}

          <dl
            className={cn(
              'space-y-1.5',
              compact ? 'mt-2 text-[10px]' : 'mt-3 text-sm lg:mt-2.5 lg:text-[11px]',
              isSocial && 'max-lg:mt-3 max-lg:w-full max-lg:border-t max-lg:border-white/[0.06] max-lg:pt-3',
            )}
          >
            <div
              className={cn(
                'flex gap-2',
                isSocial && 'max-lg:flex-col max-lg:items-center max-lg:gap-0.5',
              )}
            >
              <dt className="shrink-0 text-muted-foreground/75 max-lg:text-xs">WhatsApp</dt>
              <dd className="min-w-0 truncate font-medium tabular-nums text-foreground max-lg:text-sm">
                {displayPhone}
              </dd>
            </div>
            <div
              className={cn(
                'flex min-w-0 gap-2',
                isSocial && 'max-lg:flex-col max-lg:items-center max-lg:gap-0.5',
                compact && 'min-w-0',
              )}
            >
              <dt className="shrink-0 text-muted-foreground/75 max-lg:text-xs">E-mail</dt>
              <dd className="min-w-0 overflow-hidden truncate text-ellipsis whitespace-nowrap font-medium text-foreground/90 max-lg:text-sm">
                {email}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
