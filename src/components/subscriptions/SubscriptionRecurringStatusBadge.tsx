import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  recurringBadgeClassName,
  type RecurringDisplayBadge,
} from '@/lib/subscriptionRecurringDisplay';

type Props = {
  display: RecurringDisplayBadge;
  className?: string;
  showDetail?: boolean;
};

export function SubscriptionRecurringStatusBadge({ display, className, showDetail = false }: Props) {
  return (
    <div className={cn('inline-flex flex-col items-start gap-0.5 max-w-full', className)}>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                'font-normal text-[11px] sm:text-xs cursor-help max-w-full truncate',
                recurringBadgeClassName[display.variant]
              )}
            >
              {display.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm text-xs leading-relaxed">
            <p>{display.tooltip}</p>
            {showDetail && display.detail ? (
              <p className="mt-1.5 text-muted-foreground border-t border-border/60 pt-1.5">{display.detail}</p>
            ) : null}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {showDetail && display.detail ? (
        <span className="text-[10px] text-muted-foreground leading-snug max-w-[min(280px,90vw)]">
          {display.detail}
        </span>
      ) : null}
    </div>
  );
}
