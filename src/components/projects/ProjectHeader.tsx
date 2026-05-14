import { ArrowLeft, File, MoreVertical, Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Project } from '@/components/projects/types';

type ProjectHeaderProps = {
  project: Project;
  onBack: () => void;
  onSettings: () => void;
  onSaveAsTemplate: () => void;
  onNewVersion?: () => void;
  className?: string;
};

function statusLabel(status: string | undefined) {
  if (!status) return 'Ativo';
  const normalized = status.replace(/[-_]/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function ProjectHeader({
  project,
  onBack,
  onSettings,
  onSaveAsTemplate,
  onNewVersion,
  className,
}: ProjectHeaderProps) {
  const isAdvanced = project.project_type === 'advanced';

  return (
    <section
      className={cn(
        'rounded-xl border border-border/70 bg-card/80 px-3 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/70 md:px-4',
        className,
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={onBack} aria-label="Voltar para projetos">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-semibold tracking-tight">{project.name}</h2>
                {isAdvanced ? <Badge className="h-5 bg-primary/10 px-2 text-[11px] text-primary hover:bg-primary/15">Avançado</Badge> : null}
                <Badge variant="outline" className="h-5 px-2 text-[11px]">{statusLabel(project.status)}</Badge>
              </div>
              {project.teamName ? <p className="mt-0.5 text-xs text-muted-foreground">Equipe: {project.teamName}</p> : null}
            </div>
          </div>
          {project.tags && project.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {project.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {onNewVersion ? (
            <Button size="sm" className="h-8" onClick={onNewVersion}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Nova versão
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" className="h-8" onClick={onSettings}>
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Configurações
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" aria-label="Ações do projeto">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onSaveAsTemplate}>
                <File className="mr-2 h-4 w-4" />
                Salvar como modelo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </section>
  );
}
