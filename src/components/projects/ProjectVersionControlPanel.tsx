import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, ListTodo, Lock, MoreHorizontal, Rocket, TrendingUp, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectVersionsBar } from '@/components/projects/ProjectVersionsBar';
import { ProjectVersionSummary } from '@/components/projects/ProjectVersionSummary';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ProjectVersion } from '@/services/projects';
import type { ProjectVersionSelection } from '@/lib/projectVersionSelection';
import { computeReleaseHealth, getProjectVersionStatusMeta } from '@/lib/projectVersionVisual';
import { cn } from '@/lib/utils';

type ProjectVersionControlPanelProps = {
  versions: ProjectVersion[];
  selection: ProjectVersionSelection;
  selectedVersion: ProjectVersion | null;
  onSelectionChange: (selection: ProjectVersionSelection) => void;
  onCreateVersion: () => void;
  onEditVersion: (version: ProjectVersion) => void;
  onPublish: () => void;
  onDuplicate: () => void;
  onUnfreeze: () => void;
  projectId?: string;
  tenantId?: string | null;
};

function MetricInline({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      <strong className="font-semibold text-foreground">{value}</strong>
      {label}
    </span>
  );
}

function ReleaseSkeleton() {
  return (
    <div className="space-y-3 rounded-xl bg-background/40 p-3">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-[58px] rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-1.5 rounded-full" />
    </div>
  );
}

export function ProjectVersionControlPanel({
  versions,
  selection,
  selectedVersion,
  onSelectionChange,
  onCreateVersion,
  onEditVersion,
  onPublish,
  onDuplicate,
  onUnfreeze,
  projectId,
  tenantId,
}: ProjectVersionControlPanelProps) {
  const totalTasks = selectedVersion?.metrics?.total_tasks ?? 0;
  const completedTasks = selectedVersion?.metrics?.completed_tasks ?? 0;
  const openTasks = selectedVersion?.metrics?.open_tasks ?? Math.max(totalTasks - completedTasks, 0);
  const overdueTasks = selectedVersion?.metrics?.overdue_tasks ?? 0;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const readyToPublish = Boolean(selectedVersion?.metrics?.ready_to_publish && totalTasks > 0);
  const publishDisabled = !selectedVersion || !readyToPublish || selectedVersion.status === 'published';
  const statusMeta = selectedVersion ? getProjectVersionStatusMeta(selectedVersion.status) : null;
  const StatusIcon = statusMeta?.icon;
  const frozenMeta = selectedVersion?.frozen ? getProjectVersionStatusMeta(selectedVersion.status, true) : null;
  const FrozenIcon = frozenMeta?.icon;
  const health = selectedVersion ? computeReleaseHealth(selectedVersion) : null;
  const releaseSummaryStorageKey = useMemo(
    () => (projectId ? `release-summary:${tenantId ?? 'tenant'}:${projectId}` : null),
    [projectId, tenantId],
  );
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!releaseSummaryStorageKey) {
      setExpanded(false);
      return;
    }
    const stored = window.localStorage.getItem(releaseSummaryStorageKey);
    setExpanded(stored == null ? false : stored !== 'collapsed');
  }, [releaseSummaryStorageKey]);

  const updateExpanded = (next: boolean) => {
    setExpanded(next);
    if (releaseSummaryStorageKey) {
      window.localStorage.setItem(releaseSummaryStorageKey, next ? 'expanded' : 'collapsed');
    }
  };

  return (
    <Collapsible open={expanded} onOpenChange={updateExpanded} asChild>
      <Card className="animate-in fade-in-50 overflow-hidden rounded-2xl border-border/70 bg-card/70 shadow-sm duration-300">
      <CardHeader className="p-3 md:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="min-w-[220px]">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Release atual</p>
              <CardTitle className="sr-only">{selectedVersion?.name ?? 'Selecione uma versão'}</CardTitle>
              <ProjectVersionsBar
                versions={versions}
                selection={selection}
                onSelectionChange={onSelectionChange}
                onCreateVersion={onCreateVersion}
                onEditVersion={onEditVersion}
                canManage={false}
              />
            </div>
            {selectedVersion ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {statusMeta && StatusIcon ? (
                  <Badge variant="outline" className={cn('h-6 gap-1.5 rounded-full px-2 text-[11px]', statusMeta.className)}>
                    <StatusIcon className="h-3.5 w-3.5" />
                    {statusMeta.label}
                  </Badge>
                ) : null}
                {health ? (
                  <Badge variant="outline" className={cn('h-6 rounded-full px-2 text-[11px]', health.className)}>
                    {health.label}
                  </Badge>
                ) : null}
                <MetricInline icon={TrendingUp} value={`${progress}%`} label="progresso" />
                <MetricInline icon={CheckCircle2} value={completedTasks} label="concluídas" />
                <MetricInline icon={AlertTriangle} value={overdueTasks} label="atrasadas" />
                {selectedVersion.metrics?.feature_tasks ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    ✨ <strong className="font-semibold text-foreground">{selectedVersion.metrics.feature_tasks}</strong> features
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <CollapsibleTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs">
                {expanded ? 'Ocultar detalhes' : 'Mostrar detalhes'}
                <MoreHorizontal className={cn('h-4 w-4 transition-transform duration-200', expanded && 'rotate-90')} />
              </Button>
            </CollapsibleTrigger>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" className="h-8" disabled={publishDisabled} onClick={onPublish}>
                      <Rocket className="mr-2 h-4 w-4" />
                      Publicar
                    </Button>
                  </span>
                </TooltipTrigger>
                {publishDisabled ? (
                  <TooltipContent>
                    {totalTasks === 0 ? 'Adicione tarefas antes de publicar.' : 'Conclua as pendências antes de publicar.'}
                  </TooltipContent>
                ) : null}
              </Tooltip>
            </TooltipProvider>
            <Button size="sm" className="h-8" variant="outline" disabled={!selectedVersion} onClick={onDuplicate}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicar
            </Button>
            {selectedVersion?.frozen ? (
              <Button size="sm" className="h-8" variant="outline" onClick={onUnfreeze}>
                <Lock className="mr-2 h-4 w-4" />
                Descongelar
              </Button>
            ) : null}
          </div>
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => updateExpanded(!expanded)}>
                  {expanded ? 'Ocultar detalhes' : 'Mostrar detalhes'}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={publishDisabled} onClick={onPublish}>Publicar</DropdownMenuItem>
                <DropdownMenuItem disabled={!selectedVersion} onClick={onDuplicate}>Duplicar</DropdownMenuItem>
                {selectedVersion?.frozen ? (
                  <DropdownMenuItem onClick={onUnfreeze}>Descongelar</DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CollapsibleContent className="data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-1 data-[state=open]:slide-in-from-top-1">
      <CardContent className="px-3 pb-3 pt-0 md:px-4 md:pb-4">
        {selectedVersion ? (
          <ProjectVersionSummary version={selectedVersion} />
        ) : versions.length > 0 ? (
          <ReleaseSkeleton />
        ) : (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Crie uma versão para começar a organizar as entregas deste projeto.
          </div>
        )}
      </CardContent>
      </CollapsibleContent>
    </Card>
    </Collapsible>
  );
}
