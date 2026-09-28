import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { FinancialAlert } from '@/lib/subscriptionFinancialExperience';
import { resolveErrorModalContent } from '@/lib/subscriptionFinancialRefinement';
import { focusRingClass } from './FinancialStatCard';
import { cn } from '@/lib/utils';
import { CheckCircle2 } from 'lucide-react';

type Props = {
  alert: FinancialAlert | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExecute: (alert: FinancialAlert) => void;
};

export function FinancialResolveDialog({ alert, open, onOpenChange, onExecute }: Props) {
  if (!alert) return null;

  const content = resolveErrorModalContent(alert);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-focus-trap-root className="sm:max-w-md" onEscapeKeyDown={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>{content.title}</DialogTitle>
          <DialogDescription className="sr-only">Orientações para resolver o alerta financeiro</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2 text-sm">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Motivo</p>
            <p>{content.reason}</p>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Solução
            </p>
            <p>{content.solution}</p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className={focusRingClass()}>
            Fechar
          </Button>
          <Button
            type="button"
            className={cn(focusRingClass())}
            onClick={() => {
              onExecute(alert);
              onOpenChange(false);
            }}
          >
            {content.actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
