import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
  formatCrmIdentitySecondaryLine,
  resolveProfileAvatarUrl,
} from '@/utils/chatIdentityDisplay';

export type CrmIdentityListEntity = {
  name?: string | null;
  avatar_url?: string | null;
  photo?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
};

export function CrmIdentityListRow({
  entity,
  whatsappAvatarUrl,
  className,
  leading,
  avatarClassName,
}: {
  entity: CrmIdentityListEntity;
  whatsappAvatarUrl?: string | null;
  className?: string;
  /** Ex.: ícone de seleção à esquerda */
  leading?: React.ReactNode;
  avatarClassName?: string;
}) {
  const listAvatar = resolveProfileAvatarUrl(entity, whatsappAvatarUrl ?? null);
  const secondary = formatCrmIdentitySecondaryLine(entity);

  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-3', className)}>
      {leading}
      <Avatar className={cn('h-8 w-8 shrink-0', avatarClassName)}>
        {listAvatar.src ? <AvatarImage src={listAvatar.src} alt={entity.name ?? ''} /> : null}
        <AvatarFallback className="text-xs">{listAvatar.initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 text-left">
        <div className="text-sm font-medium leading-tight truncate">{entity.name || '—'}</div>
        <div className="text-xs text-muted-foreground truncate">{secondary}</div>
      </div>
    </div>
  );
}
