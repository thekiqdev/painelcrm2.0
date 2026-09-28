import { Headphones } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { resolveAssigneeAvatarSrc } from '@/lib/assigneeAvatarUrl';
import { cn } from '@/lib/utils';
import { assigneeInitials, shortOperatorName } from '@/utils/chatKanbanCardDisplay';

const SIZE = {
  xs: {
    root: 'gap-0.5',
    avatar: 'h-3 w-3 border-border/50',
    headphones: 'h-2.5 w-2.5',
    fallback: 'text-[6px]',
    name: 'text-[10px]',
  },
  sm: {
    root: 'gap-1',
    avatar: 'h-3.5 w-3.5 border-border/50',
    headphones: 'h-2.5 w-2.5',
    fallback: 'text-[6px]',
    name: 'text-[10px]',
  },
  md: {
    root: 'gap-1',
    avatar: 'h-4 w-4 border-border/60',
    headphones: 'h-2.5 w-2.5',
    fallback: 'text-[7px]',
    name: 'text-[10px]',
  },
} as const;

export type ChatAssigneePresenceSize = keyof typeof SIZE;

type Props = {
  /** Nome completo ou curto do operador. */
  displayName: string;
  /** URL bruta (profiles/users/API); resolução única via resolveAssigneeAvatarSrc. */
  avatarUrl?: string | null;
  size?: ChatAssigneePresenceSize;
  showHeadphones?: boolean;
  /** Nome já truncado; se omitido usa shortOperatorName(displayName). */
  shortName?: string;
  className?: string;
  nameClassName?: string;
  avatarClassName?: string;
  headphonesClassName?: string;
  fallbackClassName?: string;
  title?: string;
};

/**
 * Elemento único de presença do atendente: headset + foto de perfil + nome.
 * Usar em lista, header da thread e float — evita fallbacks de iniciais quando a foto existe.
 */
export function ChatAssigneePresence({
  displayName,
  avatarUrl,
  size = 'md',
  showHeadphones = true,
  shortName,
  className,
  nameClassName,
  avatarClassName,
  headphonesClassName,
  fallbackClassName,
  title,
}: Props) {
  const label = displayName.trim();
  if (!label) return null;

  const tokens = SIZE[size];
  const src = resolveAssigneeAvatarSrc(avatarUrl);
  const initials = assigneeInitials(label);
  const name = shortName?.trim() || shortOperatorName(label);

  return (
    <span
      className={cn('inline-flex min-w-0 max-w-full items-center', tokens.root, className)}
      title={title ?? label}
    >
      {showHeadphones ? (
        <Headphones
          className={cn('shrink-0 opacity-85 text-muted-foreground', tokens.headphones, headphonesClassName)}
          aria-hidden
        />
      ) : null}
      <Avatar className={cn('shrink-0 border', tokens.avatar, avatarClassName)}>
        {src ? <AvatarImage src={src} alt="" className="object-cover" /> : null}
        <AvatarFallback
          className={cn(
            'bg-primary/15 font-semibold text-primary',
            tokens.fallback,
            fallbackClassName,
          )}
        >
          {initials}
        </AvatarFallback>
      </Avatar>
      <span className={cn('min-w-0 truncate font-medium text-foreground', tokens.name, nameClassName)}>
        {name}
      </span>
    </span>
  );
}
