import { useMemo, useState } from 'react';
import { ChevronDown, GitBranch, Lock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import type { ProjectVersion } from '@/services/projects';
import {
  type ProjectVersionSelection,
} from '@/lib/projectVersionSelection';
import { getProjectVersionStatusMeta } from '@/lib/projectVersionVisual';

type ProjectVersionsBarProps = {
  versions: ProjectVersion[];
  selection: ProjectVersionSelection;
  onSelectionChange: (selection: ProjectVersionSelection) => void;
  onCreateVersion: () => void;
  onEditVersion: (version: ProjectVersion) => void;
  canManage?: boolean;
  className?: string;
};

function VersionOption({
  version,
  selected,
  onSelect,
  onEdit,
}: {
  version: ProjectVersion;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const total = version.metrics?.total_tasks ?? 0;
  const completed = version.metrics?.completed_tasks ?? 0;
  const overdue = version.metrics?.overdue_tasks ?? 0;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const statusMeta = getProjectVersionStatusMeta(version.status, version.frozen);
  const StatusIcon = statusMeta.icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onEdit}
      className={cn(
        'w-full rounded-xl border px-3 py-3 text-left transition-all duration-200',
        selected ? 'border-primary/70 bg-primary/5 shadow-sm' : 'border-border/70 hover:border-primary/40 hover:bg-muted/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-medium">
            <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
            {version.name}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <StatusIcon className="h-3.5 w-3.5" />
              {statusMeta.label}
            </span>
            {version.due_date ? ` · Prazo ${version.due_date}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {version.frozen ? (
            <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px]">
              <Lock className="h-3 w-3" />
              Congelada
            </Badge>
          ) : null}
          {version.is_default ? <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Padrão</Badge> : null}
        </div>
      </div>
      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progresso</span>
          <span>{progress}%</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>{total} tarefas</span>
        <span>{completed} concluídas</span>
        <span>{overdue} atrasadas</span>
      </div>
    </button>
  );
}

function VersionList({
  versions,
  selection,
  onSelectionChange,
  onCreateVersion,
  onEditVersion,
  canManage,
}: Omit<ProjectVersionsBarProps, 'className'>) {
  const activeVersions = useMemo(
    () => versions.filter((version) => !version.archived_at),
    [versions],
  );

  return (
    <div className="space-y-3">
      <ScrollArea className="max-h-[min(60vh,420px)] pr-2">
        <div className="space-y-2">
          {activeVersions.map((version) => (
            <VersionOption
              key={version.id}
              version={version}
              selected={selection.mode === 'version' && selection.versionId === version.id}
              onSelect={() => onSelectionChange({ mode: 'version', versionId: version.id })}
              onEdit={() => onEditVersion(version)}
            />
          ))}
        </div>
      </ScrollArea>
      {canManage ? (
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={onCreateVersion}>
          <Plus className="mr-2 h-4 w-4" />
          Nova versão
        </Button>
      ) : null}
    </div>
  );
}

export function ProjectVersionsBar({
  versions,
  selection,
  onSelectionChange,
  onCreateVersion,
  onEditVersion,
  canManage = true,
  className,
}: ProjectVersionsBarProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const activeVersions = useMemo(
    () => versions.filter((version) => !version.archived_at),
    [versions],
  );
  const selectedVersion = activeVersions.find(
    (version) => selection.mode === 'version' && version.id === selection.versionId,
  );
  const selectedStatusMeta = selectedVersion
    ? getProjectVersionStatusMeta(selectedVersion.status, selectedVersion.frozen)
    : null;
  const SelectedStatusIcon = selectedStatusMeta?.icon;

  const triggerLabel = selectedVersion?.name ?? 'Selecionar versão';
  const triggerContent = (
    <>
      <span className="inline-flex min-w-0 items-center gap-2">
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate font-medium">{triggerLabel}</span>
        {selectedStatusMeta && SelectedStatusIcon ? (
          <span className={cn('hidden items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] sm:inline-flex', selectedStatusMeta.className)}>
            <SelectedStatusIcon className="h-3 w-3" />
            {selectedStatusMeta.label}
          </span>
        ) : null}
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
    </>
  );

  if (isMobile) {
    return (
      <div className={cn('bg-background/95 backdrop-blur', className)}>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" className="h-9 w-full justify-between rounded-full border-border/70 bg-background/70 px-3 text-xs shadow-sm">
              {triggerContent}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh]">
            <SheetHeader>
              <SheetTitle>Versões do projeto</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <VersionList
                versions={versions}
                selection={selection}
                onSelectionChange={(next) => {
                  onSelectionChange(next);
                  setOpen(false);
                }}
                onCreateVersion={() => {
                  setOpen(false);
                  onCreateVersion();
                }}
                onEditVersion={onEditVersion}
                canManage={canManage}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="h-9 min-w-[260px] justify-between rounded-full border-border/70 bg-background/70 px-3 text-xs shadow-sm transition-all hover:border-primary/50 hover:bg-primary/5">
            {triggerContent}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[390px] rounded-2xl border-border/70 p-3 shadow-xl">
          <VersionList
            versions={versions}
            selection={selection}
            onSelectionChange={(next) => {
              onSelectionChange(next);
              setOpen(false);
            }}
            onCreateVersion={() => {
              setOpen(false);
              onCreateVersion();
            }}
            onEditVersion={onEditVersion}
            canManage={canManage}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
