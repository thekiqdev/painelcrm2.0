import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PublicAcquisitionPlan } from '../types';
import { OperationDesktopFooter } from './OperationDesktopFooter';
import { OperationLivePreview } from './OperationLivePreview';
import { OperationOperationalSummary } from './OperationOperationalSummary';
import { OperationPlanFoundation } from './OperationPlanFoundation';
import { OperationResourcesGrid } from './OperationResourcesGrid';
import { OperationTeamSection } from './OperationTeamSection';
import { OperationWhatsappSection } from './OperationWhatsappSection';
import { buildOperationPreview, clampUsersCount, resolveMaxUsers } from './operationBuilderState';

type Props = {
  plans: PublicAcquisitionPlan[];
  loading: boolean;
  selectedId: string;
  usersCount: number;
  onSelect: (id: string) => void;
  onUsersCountChange: (count: number) => void;
  onBack?: () => void;
  onContinue?: () => void;
  continueLoading?: boolean;
  continueDisabled?: boolean;
  continueLabel?: string;
};

export function OperationSetupStep({
  plans,
  loading,
  selectedId,
  usersCount,
  onSelect,
  onUsersCountChange,
  onBack,
  onContinue,
  continueLoading,
  continueDisabled,
  continueLabel,
}: Props) {
  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedId) ?? null,
    [plans, selectedId],
  );

  const maxUsers = resolveMaxUsers(selectedPlan);
  const safeUsers = clampUsersCount(usersCount, selectedPlan);
  const preview = useMemo(
    () => buildOperationPreview(selectedPlan, safeUsers),
    [selectedPlan, safeUsers],
  );

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center lg:min-h-0 lg:flex-1">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-muted-foreground">
        Nenhum plano disponível no momento.
      </p>
    );
  }

  const handleUsersChange = (count: number) => {
    onUsersCountChange(clampUsersCount(count, selectedPlan));
  };

  return (
    <>
      {/* Mobile */}
      <div className="space-y-4 pb-2 lg:hidden">
        <OperationPlanFoundation
          plans={plans}
          selectedId={selectedId}
          usersCount={safeUsers}
          onSelect={onSelect}
        />
        <OperationTeamSection usersCount={safeUsers} maxUsers={maxUsers} onChange={handleUsersChange} />
        <OperationWhatsappSection />
        <OperationResourcesGrid />
      </div>

      {/* Desktop — cabe em 100vh, sem scroll da página */}
      <div className="hidden h-full min-h-0 flex-col overflow-hidden lg:flex">
        <header className="mb-4 shrink-0 space-y-0.5">
          <h1 className="font-display text-[1.45rem] font-semibold tracking-tight text-foreground">
            Monte sua operação
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Configure o workspace — a ativação continua na próxima etapa.
          </p>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[1.35fr_0.75fr] gap-6 overflow-hidden">
          <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
            <div className="min-h-0 flex-1 space-y-3 overflow-hidden">
              <OperationPlanFoundation
                plans={plans}
                selectedId={selectedId}
                usersCount={safeUsers}
                onSelect={onSelect}
              />
              <OperationTeamSection
                usersCount={safeUsers}
                maxUsers={maxUsers}
                onChange={handleUsersChange}
              />
              <OperationWhatsappSection />
              <OperationResourcesGrid />
            </div>

            {onContinue && onBack ? (
              <OperationDesktopFooter
                preview={preview}
                onBack={onBack}
                onContinue={onContinue}
                loading={continueLoading}
                disabled={continueDisabled}
                label={continueLabel}
              />
            ) : null}
          </div>

          <aside
            className={cn('flex min-h-0 flex-col gap-4 overflow-hidden')}
            aria-label="Preview da operação"
          >
            <OperationLivePreview preview={preview} />
            <OperationOperationalSummary preview={preview} />
          </aside>
        </div>
      </div>
    </>
  );
}
