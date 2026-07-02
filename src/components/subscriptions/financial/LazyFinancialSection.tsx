import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { shouldDeferFinancialSection } from '@/lib/subscriptionFinancialConsistency';

type Props = {
  sectionId: string;
  children: ReactNode;
  className?: string;
  minHeight?: number;
};

export function LazyFinancialSection({ sectionId, children, className, minHeight = 120 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!shouldDeferFinancialSection(sectionId));

  useEffect(() => {
    if (visible || !ref.current) return;
    const el = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div
      ref={ref}
      id={sectionId}
      className={cn(className)}
      style={!visible ? { minHeight } : undefined}
      aria-busy={!visible}
    >
      {visible ? children : (
        <div className="rounded-lg border bg-muted/20 animate-pulse" style={{ minHeight }} aria-hidden />
      )}
    </div>
  );
}
