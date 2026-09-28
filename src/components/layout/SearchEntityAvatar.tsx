import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { resolveProfileAvatarUrl } from '@/utils/chatIdentityDisplay';

type Entity = {
  name?: string | null;
  avatar_url?: string | null;
  photo?: string | null;
};

type Props = {
  entity: Entity | null;
  whatsappAvatarUrl?: string | null;
  /** `desktop` ≈ 36px, `mobile` ≈ 44px */
  size?: 'desktop' | 'mobile';
  className?: string;
};

export function SearchEntityAvatar({ entity, whatsappAvatarUrl, size = 'desktop', className }: Props) {
  const r = resolveProfileAvatarUrl(
    { name: entity?.name ?? null, avatar_url: entity?.avatar_url ?? null, photo: entity?.photo ?? null },
    whatsappAvatarUrl?.trim() || null,
  );
  const dim = size === 'mobile' ? 'h-11 w-11 min-h-[2.75rem] min-w-[2.75rem]' : 'h-9 w-9 min-h-9 min-w-9';
  const text = size === 'mobile' ? 'text-base' : 'text-sm';

  return (
    <Avatar className={cn(dim, 'shrink-0 border border-border/60 bg-muted/40', className)}>
      {r.src ? (
        <AvatarImage src={r.src} alt="" className="object-cover" />
      ) : null}
      <AvatarFallback className={cn('bg-muted font-semibold text-muted-foreground', text)}>
        {r.initials}
      </AvatarFallback>
    </Avatar>
  );
}
