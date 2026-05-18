import { Archive, ArchiveRestore, GitBranch, Pencil, Plus, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ProjectVersion } from '@/services/projects';
import { getProjectVersionStatusMeta } from '@/lib/projectVersionVisual';
import { cn } from '@/lib/utils';

export type ProjectSettingsVersionsTabProps = {
  versions: ProjectVersion[];
  saving?: boolean;
  onCreateVersion: () => void;
  onEditVersion: (version: ProjectVersion) => void;
  onArchiveVersion: (version: ProjectVersion) => void;
  onUnarchiveVersion: (version: ProjectVersion) => void;
};

function VersionRow({
  version,
  saving,
  onEdit,
  onArchive,
  onUnarchive,
}: {
  version: ProjectVersion;
  saving?: boolean;
  onEdit: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
}) {
  const statusMeta = getProjectVersionStatusMeta(version.status, version.frozen);
  const StatusIcon = statusMeta.icon;
  const total = version.metrics?.total_tasks ?? 0;
  const open =
    version.metrics?.open_tasks ?? Math.max(0, total - (version.metrics?.completed_tasks ?? 0));

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{version.name}</span>
          {version.is_default ? (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Star className="h-3 w-3" />
              Padrão
            </Badge>
          ) : null}
          {version.archived_at ? (
            <Badge variant="outline" className="text-[10px]">
              Arquivada
            </Badge>
          ) : (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]',
                statusMeta.className,
              )}
            >
              <StatusIcon className="h-3 w-3" />
              {statusMeta.label}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {open} aberta{open === 1 ? '' : 's'} · {total} tarefa{total === 1 ? '' : 's'}
          {version.due_date ? ` · prazo ${version.due_date}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onEdit}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Editar
        </Button>
        {version.archived_at && onUnarchive ? (
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onUnarchive}>
            <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
            Desarquivar
          </Button>
        ) : onArchive ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving || version.is_default}
            onClick={onArchive}
          >
            <Archive className="mr-1.5 h-3.5 w-3.5" />
            Arquivar
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ProjectSettingsVersionsTab({
  versions,
  saving,
  onCreateVersion,
  onEditVersion,
  onArchiveVersion,
  onUnarchiveVersion,
}: ProjectSettingsVersionsTabProps) {
  const active = versions.filter((v) => !v.archived_at);
  const archived = versions.filter((v) => v.archived_at);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Versões do projeto
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Crie, edite, arquive ou restaure versões. As tarefas ficam isoladas por versão.
          </p>
        </div>
        <Button type="button" size="sm" disabled={saving} onClick={onCreateVersion}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nova versão
        </Button>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ativas</h4>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">
            Nenhuma versão ativa.
          </p>
        ) : (
          active.map((version) => (
            <VersionRow
              key={version.id}
              version={version}
              saving={saving}
              onEdit={() => onEditVersion(version)}
              onArchive={() => onArchiveVersion(version)}
            />
          ))
        )}
      </div>

      {archived.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Arquivadas</h4>
          {archived.map((version) => (
            <VersionRow
              key={version.id}
              version={version}
              saving={saving}
              onEdit={() => onEditVersion(version)}
              onUnarchive={() => onUnarchiveVersion(version)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}