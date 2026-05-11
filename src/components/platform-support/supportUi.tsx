import {
  Bug,
  CheckCircle2,
  CircleDot,
  Clock,
  CreditCard,
  Globe,
  HelpCircle,
  Lightbulb,
  Lock,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  platformSupportCategoryLabels,
  platformSupportPriorityColors,
  platformSupportPriorityLabels,
  platformSupportStatusColors,
  platformSupportStatusLabels,
  type PlatformSupportCategory,
  type PlatformSupportPriority,
  type PlatformSupportStatus,
} from '@/types/platformSupport';

export const platformSupportCategoryIcons: Record<PlatformSupportCategory, LucideIcon> = {
  question: HelpCircle,
  bug: Bug,
  billing: CreditCard,
  whatsapp_integration: MessageCircle,
  google_integration: Globe,
  suggestion: Lightbulb,
  other: MoreHorizontal,
};

const platformSupportStatusIcons: Record<PlatformSupportStatus, LucideIcon> = {
  open: CircleDot,
  waiting_support: Clock,
  waiting_customer: MessageSquare,
  resolved: CheckCircle2,
  closed: Lock,
};

type BadgeSize = 'sm' | 'default';

export function SupportStatusBadge({
  status,
  size = 'default',
  className,
}: {
  status: PlatformSupportStatus;
  size?: BadgeSize;
  className?: string;
}) {
  const Icon = platformSupportStatusIcons[status];
  return (
    <Badge
      className={cn(
        'gap-1 font-medium',
        size === 'sm' && 'px-2 py-0 text-[10px]',
        platformSupportStatusColors[status],
        className,
      )}
    >
      <Icon className={cn(size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3')} aria-hidden />
      {platformSupportStatusLabels[status]}
    </Badge>
  );
}

export function SupportPriorityBadge({
  priority,
  size = 'default',
  className,
}: {
  priority: PlatformSupportPriority;
  size?: BadgeSize;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium',
        size === 'sm' && 'px-2 py-0 text-[10px]',
        platformSupportPriorityColors[priority],
        className,
      )}
    >
      {platformSupportPriorityLabels[priority]}
    </Badge>
  );
}

export function SupportCategoryLabel({ category }: { category: PlatformSupportCategory }) {
  const Icon = platformSupportCategoryIcons[category];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {platformSupportCategoryLabels[category]}
    </span>
  );
}
