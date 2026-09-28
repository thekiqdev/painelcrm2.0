import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { buildBusinessTimelineEvents } from '@/lib/billingSubscriptionExperience';
import {
  expandAnimationClass,
  groupSmartTimeline,
  polishTransitionClass,
} from '@/lib/billingSubscriptionExperiencePolish';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { formatExperienceYmd } from './subscriptionExperienceFormat';
import { SubscriptionExperienceEmptyState } from './SubscriptionExperienceEmptyState';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

type Props = {
  detail: CrmSubscriptionDetailPayload;
  className?: string;
  compact?: boolean;
};

export function SubscriptionBusinessTimeline({ detail, className, compact }: Props) {
  const groups = useMemo(() => {
    const events = buildBusinessTimelineEvents(detail);
    return groupSmartTimeline(events);
  }, [detail]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const byMonth = useMemo(() => {
    const map = new Map<string, typeof groups>();
    for (const g of groups) {
      const list = map.get(g.monthKey) ?? [];
      list.push(g);
      map.set(g.monthKey, list);
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [groups]);

  if (groups.length === 0) {
    return <SubscriptionExperienceEmptyState kind="history" className={className} />;
  }

  return (
    <Card className={cn('border shadow-sm overflow-hidden', className)}>
      <CardHeader className="bg-muted/30 border-b py-4">
        <CardTitle className="text-base font-medium">Linha do tempo</CardTitle>
      </CardHeader>
      <CardContent className="pt-5" role="feed" aria-label="Eventos da assinatura">
        <div className="space-y-6">
          {byMonth.map(([monthKey, monthGroups]) => (
            <section key={monthKey} aria-labelledby={`tl-month-${monthKey}`}>
              <h3 id={`tl-month-${monthKey}`} className="text-sm font-semibold text-muted-foreground mb-3">
                {monthGroups[0]?.monthLabelPt}
              </h3>
              <ul className="space-y-2">
                {monthGroups.map((group) => {
                  const isOpen = expanded[group.id] ?? group.count === 1;
                  return (
                    <li
                      key={group.id}
                      className={cn('rounded-lg border bg-card/50', polishTransitionClass())}
                    >
                      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base shrink-0" aria-hidden>
                            {group.icon}
                          </span>
                          <span className={cn('font-medium truncate', compact ? 'text-sm' : 'text-base')}>
                            {group.title}
                          </span>
                        </div>
                        {group.count > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs shrink-0 gap-1"
                            aria-expanded={isOpen}
                            onClick={() =>
                              setExpanded((prev) => ({ ...prev, [group.id]: !isOpen }))
                            }
                          >
                            Expandir
                            <ChevronDown
                              className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')}
                            />
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                            {formatExperienceYmd(group.events[0]?.ymd)}
                          </span>
                        )}
                      </div>
                      {isOpen && group.count > 1 ? (
                        <ul
                          className={cn(
                            'border-t px-3 py-2 space-y-2',
                            expandAnimationClass(isOpen)
                          )}
                        >
                          {group.events.map((ev) => (
                            <li key={ev.id} className="text-sm flex justify-between gap-2">
                              <span>{ev.title}</span>
                              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                                {formatExperienceYmd(ev.ymd)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
