import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, History, ListTodo, TrendingUp } from 'lucide-react';
import type { ProjectVersion } from '@/services/projects';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  formatCompactDate,
  formatRelativeTime,
  parseReleaseNotes,
} from '@/lib/projectVersionVisual';

type ProjectVersionSummaryProps = {
  version: ProjectVersion | null;
};

export function ProjectVersionSummary({ version }: ProjectVersionSummaryProps) {
  const isMobile = useIsMobile();
  if (!version) return null;

  const total = version.metrics?.total_tasks ?? 0;
  const completed = version.metrics?.completed_tasks ?? 0;
  const overdue = version.metrics?.overdue_tasks ?? 0;
  const open = version.metrics?.open_tasks ?? Math.max(total - completed, 0);
  const daysRemaining = version.metrics?.days_remaining;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const releaseNoteSections = parseReleaseNotes(version.release_notes);
  const releaseNotesCount = releaseNoteSections.reduce((sum, section) => sum + section.items.length, 0);
  const createdRelative = formatRelativeTime(version.created_at);
  const updatedRelative = formatRelativeTime(version.updated_at);
  const dueDate = formatCompactDate(version.due_date);

  const stats = [
    { label: 'Progresso', value: `${progress}%`, icon: TrendingUp },
    { label: 'Concluídas', value: completed, icon: CheckCircle2 },
    { label: 'Abertas', value: open, icon: ListTodo },
    { label: 'Atrasadas', value: overdue, icon: AlertTriangle },
  ];

  const body = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {daysRemaining != null ? (
          <span>
            {daysRemaining >= 0 ? `${daysRemaining} dia(s) restantes` : `${Math.abs(daysRemaining)} dia(s) atrasada`}
          </span>
        ) : null}
        {version.start_date ? (
          <span>Início: {version.start_date}</span>
        ) : null}
        {version.frozen ? <span>Versão congelada</span> : null}
      </div>
      <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
        {stats.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="flex h-[58px] items-center gap-2 rounded-lg px-2.5 transition-colors hover:bg-muted/35">
              <Icon className="h-4 w-4 shrink-0 text-primary/70" />
              <div>
                <p className="text-lg font-semibold leading-none">{metric.value}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{metric.label}</p>
              </div>
            </div>
          );
        })}
      </div>
      <Progress value={progress} className="h-1.5 overflow-hidden rounded-full [&>div]:transition-all [&>div]:duration-700" />
      <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
        {createdRelative ? (
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            Criada {createdRelative}
          </span>
        ) : null}
        {updatedRelative ? (
          <span className="inline-flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            Atualizada {updatedRelative}
          </span>
        ) : null}
        {dueDate ? (
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            Entrega {dueDate}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {completed} concluída{completed !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span>✨ {version.metrics?.feature_tasks ?? 0} features</span>
        <span>🐛 {version.metrics?.fix_tasks ?? 0} correções</span>
        <span>⚡ {version.metrics?.improvement_tasks ?? 0} melhorias</span>
        <span>🔒 {version.metrics?.internal_tasks ?? 0} internos</span>
      </div>
      {total === 0 ? (
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Adicione tarefas para iniciar esta versão.
        </p>
      ) : version.metrics?.ready_to_publish ? (
        <p className="text-xs font-medium text-emerald-600">Esta versão está pronta para publicação.</p>
      ) : null}
      {releaseNoteSections.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50">
            <ChevronDown className="h-3.5 w-3.5" />
            Release notes ({releaseNotesCount})
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="space-y-3 rounded-xl bg-muted/25 p-3">
              {releaseNoteSections.map((section) => (
                <div key={section.key}>
                  <p className="text-xs font-semibold text-foreground">
                    <span className="mr-1.5">{section.icon}</span>
                    {section.title}
                  </p>
                  <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                    {section.items.map((item, index) => (
                      <li key={`${section.key}-${index}`} className="leading-relaxed">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );

  if (!isMobile) {
    return <div className="rounded-xl bg-background/40 p-3">{body}</div>;
  }

  return (
    <Collapsible defaultOpen className={cn('rounded-xl bg-background/40 px-3 py-1.5')}>
      <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-sm font-medium">
        Resumo da versão
        <ChevronDown className="h-4 w-4" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-3">{body}</CollapsibleContent>
    </Collapsible>
  );
}
