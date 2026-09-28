import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useFinancialEventStore } from './FinancialEventStoreContext';
import { exclusiveAccordionKey } from '@/lib/subscriptionFinancialRefinement';
import {
  buildTimelineFinancialSections,
  futureMonthsVirtualWindow,
  shouldShowBandSeparator,
  slicePastMonthsForLazy,
  temporalBandLabel,
  timelineHistoryGateLabel,
  type TimelineMonthSection,
} from '@/lib/timelineFinancialSections';
import { timelineEventElementId, timelineMonthElementId } from '@/lib/timelineNavigation';
import { humanizeTimelineItem, humanMonthSummaryTitle } from '@/lib/financialTimelineHumanizer';
import { FINANCIAL_CARD_BODY, FINANCIAL_CARD_HEADER, FINANCIAL_CARD_SHELL } from '@/lib/subscriptionFinancialOverview';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { focusRingClass } from './FinancialStatCard';

type Props = {
  className?: string;
  scrollToEventId?: string | null;
};

function MonthSection({
  section,
  isOpen,
  onToggle,
  todayYmd,
  showMonthBandLabel,
}: {
  section: TimelineMonthSection;
  isOpen: boolean;
  onToggle: () => void;
  todayYmd: string;
  showMonthBandLabel?: string;
}) {
  const paidCount = section.items.filter((i) => i.icon === '💰').length;
  const canToggle = section.count > 1 || section.bucket !== 'current';
  const showItems = isOpen;

  return (
    <section id={timelineMonthElementId(section.monthKey)}>
      {showMonthBandLabel ? (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          {showMonthBandLabel}
        </p>
      ) : null}
      <div className="rounded-xl border bg-muted/10 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{section.monthLabel}</p>
            <p className="text-lg font-bold mt-1">
              <span>{humanMonthSummaryTitle(paidCount, section.totalCents)}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {paidCount > 0 ? `${paidCount} pagamento(s)` : `${section.count} evento(s)`}
            </p>
          </div>
          {canToggle ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn('gap-1 text-xs', focusRingClass())}
              aria-expanded={isOpen}
              onClick={onToggle}
            >
              {isOpen ? 'Recolher' : 'Expandir'}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} />
            </Button>
          ) : null}
        </div>
        {showItems ? (
          <ul className="mt-4 space-y-3 border-t pt-3">
                {section.items.map((item, idx) => {
              const bandSep =
                section.bucket === 'current'
                  ? shouldShowBandSeparator(section.items, idx, todayYmd)
                  : null;
              const human = humanizeTimelineItem(item, todayYmd);
              return (
                <li key={item.id} id={timelineEventElementId(item.id)}>
                  {bandSep ? (
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 -mt-1">
                      {bandSep}
                    </p>
                  ) : null}
                  <div className="flex items-start gap-3 text-sm">
                    <span className="text-base shrink-0" aria-hidden>{human.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{human.title}</p>
                      {human.amountLine ? (
                        <p className="tabular-nums font-semibold text-base">{human.amountLine}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">{human.dateLine}</p>
                      {item.subtitle ? (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>
                      ) : null}
                      {human.actionLabel ? (
                        <p className="text-xs font-medium text-crm-primary mt-1">{human.actionLabel}</p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

export function FinancialTimeline({ className, scrollToEventId }: Props) {
  const store = useFinancialEventStore();
  const todayYmd = store.today;
  const layout = useMemo(
    () => buildTimelineFinancialSections(store.getTimelineMonthGroups(), store.events, todayYmd),
    [store, todayYmd]
  );

  const [openMonthKey, setOpenMonthKey] = useState<string | null>(layout.initialOpenMonthKey);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [futureExpanded, setFutureExpanded] = useState(false);
  const scrolledRef = useRef(false);

  useEffect(() => {
    setOpenMonthKey(layout.initialOpenMonthKey);
  }, [layout.initialOpenMonthKey]);

  useEffect(() => {
    const targetId = scrollToEventId ?? layout.focusEventId;
    if (!targetId || scrolledRef.current) return;
    const el = document.getElementById(timelineEventElementId(targetId));
    if (!el) return;
    scrolledRef.current = true;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [scrollToEventId, layout.focusEventId]);

  const { visible: presentVisible, hiddenCount: hiddenFuture } = futureMonthsVirtualWindow(
    layout.presentAndFuture,
    futureExpanded ? 99 : 6
  );
  const pastVisible = slicePastMonthsForLazy(layout.pastMonths, historyExpanded);

  if (layout.presentAndFuture.length === 0 && layout.pastMonths.length === 0) {
    return (
      <Card className={cn('border shadow-sm', className)}>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Ainda não há movimentação financeira nesta assinatura.
        </CardContent>
      </Card>
    );
  }

  let futureBandShown = false;

  return (
    <Card className={cn(FINANCIAL_CARD_SHELL, className)} id="financial-timeline">
      <CardHeader className={FINANCIAL_CARD_HEADER}>
        <CardTitle className="text-base font-medium">Timeline financeira</CardTitle>
      </CardHeader>
      <CardContent className={cn(FINANCIAL_CARD_BODY, 'space-y-4')}>
        {presentVisible.map((section) => {
          const monthBand =
            section.bucket === 'future' && !futureBandShown
              ? (() => {
                  futureBandShown = true;
                  return temporalBandLabel('future_months');
                })()
              : section.bucket === 'current'
                ? undefined
                : undefined;
          return (
            <MonthSection
              key={section.monthKey}
              section={section}
              isOpen={openMonthKey === section.monthKey}
              todayYmd={todayYmd}
              showMonthBandLabel={monthBand}
              onToggle={() =>
                setOpenMonthKey((k) => exclusiveAccordionKey(k, section.monthKey))
              }
            />
          );
        })}

        {hiddenFuture > 0 && !futureExpanded ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('w-full text-xs text-muted-foreground', focusRingClass())}
            onClick={() => setFutureExpanded(true)}
          >
            Mostrar mais {hiddenFuture} mês(es) futuro(s)
          </Button>
        ) : null}

        {layout.hasPastHistory ? (
          <>
            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0">
                {historyExpanded ? temporalBandLabel('history') : timelineHistoryGateLabel(layout.pastMonths.length)}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            {!historyExpanded ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn('w-full', focusRingClass())}
                onClick={() => setHistoryExpanded(true)}
              >
                {timelineHistoryGateLabel(layout.pastMonths.length)}
                <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : (
              pastVisible.map((section) => (
                <MonthSection
                  key={section.monthKey}
                  section={section}
                  isOpen={openMonthKey === section.monthKey}
                  todayYmd={todayYmd}
                  showMonthBandLabel={
                    section.monthKey === pastVisible[0]?.monthKey
                      ? temporalBandLabel('history')
                      : undefined
                  }
                  onToggle={() =>
                    setOpenMonthKey((k) => exclusiveAccordionKey(k, section.monthKey))
                  }
                />
              ))
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
