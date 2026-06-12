import { Building2, Check, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

type TimelineItem = {
  label: string;
  state: 'completed' | 'in_progress' | 'future';
};

const WORKSPACE_TIMELINE: TimelineItem[] = [
  { label: 'Workspace criado', state: 'completed' },
  { label: 'CRM operacional habilitado', state: 'completed' },
  { label: 'Preparando acesso', state: 'in_progress' },
  { label: 'Recovery e onboarding', state: 'future' },
];

type Props = {
  adminName?: string;
  logoDarkUrl?: string | null;
  avatarUrl?: string | null;
  className?: string;
};

function adminInitials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return `${p[0][0]}${p[1][0]}`.toUpperCase();
  return (p[0]?.[0] ?? 'A').toUpperCase();
}

function TimelineStateIcon({ state }: { state: TimelineItem['state'] }) {
  if (state === 'completed') {
    return <Check className="h-3 w-3 shrink-0 text-emerald-400" strokeWidth={2.5} aria-hidden />;
  }
  if (state === 'in_progress') {
    return <RefreshCw className="h-3 w-3 shrink-0 text-primary/90" strokeWidth={2.25} aria-hidden />;
  }
  return (
    <span
      className="inline-flex h-3 w-3 shrink-0 rounded-full border border-muted-foreground/35 bg-muted-foreground/15"
      aria-hidden
    />
  );
}

/** Sidebar compacta — resumo visual + timeline. */
export function WorkspaceRevealSidebar({ adminName = '', logoDarkUrl, avatarUrl, className }: Props) {
  const initials = adminInitials(adminName.trim() || 'A');
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col gap-2.5 overflow-hidden rounded-xl border border-white/[0.09]',
        'bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-3',
        className,
      )}
      aria-label="Progresso da ativação"
    >
      <div className="flex shrink-0 items-center gap-2 rounded-lg border border-emerald-500/20 bg-black/25 px-2.5 py-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
          {logoDarkUrl ? (
            <img src={logoDarkUrl} alt="" className="h-full w-full object-contain p-0.5" />
          ) : (
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          )}
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/25 bg-primary/10">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[10px] font-semibold text-primary">{initials}</span>
          )}
        </span>
        <span className="ml-auto inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium text-emerald-400/95">
          Workspace ativo
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          Status da ativação
        </p>
        <ul className="flex flex-col">
          {WORKSPACE_TIMELINE.map((entry, index) => {
            const isLast = index === WORKSPACE_TIMELINE.length - 1;
            const lineActive = entry.state === 'completed';

            return (
              <li
                key={entry.label}
                className={cn(
                  'relative flex items-center gap-1.5 py-1 text-[11px] leading-tight',
                  entry.state === 'completed' && 'text-foreground',
                  entry.state === 'in_progress' && 'text-foreground/95',
                  entry.state === 'future' && 'text-muted-foreground/75',
                )}
              >
                {!isLast ? (
                  <span
                    className={cn(
                      'absolute left-[5px] top-[16px] w-px',
                      lineActive ? 'bg-emerald-500/30' : 'bg-white/10',
                    )}
                    style={{ height: 'calc(100% - 4px)' }}
                    aria-hidden
                  />
                ) : null}
                <TimelineStateIcon state={entry.state} />
                <span>{entry.label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
