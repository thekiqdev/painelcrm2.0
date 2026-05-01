import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { chatAvatarUrlForImgSrc } from '@/lib/chatAvatarUrl';
import type { ConversationDragPreviewModel } from '@/lib/conversationDragPreview.types';

export function ConversationDragPreview({
  displayName,
  avatarUrl,
  initials,
  line2,
  line3,
  crm,
}: ConversationDragPreviewModel) {
  const safeAvatar = chatAvatarUrlForImgSrc(avatarUrl ?? null);
  const msg = line3 && line3.length > 90 ? `${line3.slice(0, 88)}…` : line3;

  return (
    <div
      className={cn(
        'w-[min(280px,88vw)] select-none rounded-2xl border border-border/60 bg-card/98 p-3 pr-2.5 shadow-2xl',
        'ring-1 ring-black/5 dark:ring-white/10',
        '-rotate-1 opacity-[0.97] backdrop-blur-sm',
      )}
    >
      <div className="flex items-start gap-2.5">
        <Avatar className="h-10 w-10 shrink-0 border border-border/50 shadow-sm">
          {safeAvatar ? <AvatarImage src={safeAvatar} alt="" className="object-cover" /> : null}
          <AvatarFallback className="bg-primary/12 text-xs font-semibold text-primary">
            {initials.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{displayName}</p>
          {line2 ? (
            <p className="mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground">{line2}</p>
          ) : null}
          {msg ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground/95">
              {msg}
            </p>
          ) : null}
        </div>
        {crm === 'client' ? (
          <Badge variant="secondary" className="h-5 shrink-0 px-1.5 py-0 text-[9px] font-medium">
            Cliente
          </Badge>
        ) : crm === 'lead' ? (
          <Badge className="h-5 shrink-0 border border-blue-200/80 bg-blue-100 px-1.5 py-0 text-[9px] font-medium text-blue-800">
            Lead
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
