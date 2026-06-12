import { cn } from '@/lib/utils';

type Props = {
  name: string;
  logoDark: string | null;
  logoLight: string | null;
  compact?: boolean;
};

export function CompanyOperationPreview({ name, logoDark, logoLight, compact = false }: Props) {
  const trimmed = name.trim();
  const displayName = trimmed || 'Sua operação';
  const initial = trimmed.charAt(0).toUpperCase() || 'O';

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-muted-foreground">Preview</p>
      <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
        <PreviewPanel
          name={displayName}
          initial={initial}
          logo={logoDark ?? logoLight}
          compact={compact}
          variant="dark"
          backgroundLabel="Fundo escuro"
        />
        <PreviewPanel
          name={displayName}
          initial={initial}
          logo={logoLight ?? logoDark}
          compact={compact}
          variant="light"
          backgroundLabel="Fundo claro"
        />
      </div>
    </div>
  );
}

function PreviewPanel({
  name,
  initial,
  logo,
  compact,
  variant,
  backgroundLabel,
}: {
  name: string;
  initial: string;
  logo: string | null;
  compact: boolean;
  variant: 'dark' | 'light';
  backgroundLabel: string;
}) {
  const isDark = variant === 'dark';

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border',
        isDark
          ? 'border-white/10 bg-[hsl(228,32%,6%)]'
          : 'border-black/[0.08] bg-[hsl(0,0%,98%)]',
        compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
      )}
    >
      <p
        className={cn(
          'mb-1.5 text-[9px] font-medium uppercase tracking-wide',
          isDark ? 'text-muted-foreground' : 'text-[hsl(228,20%,42%)]',
        )}
      >
        {backgroundLabel}
      </p>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1',
            isDark
              ? 'bg-[hsl(228,32%,4%)] ring-white/10'
              : 'bg-white ring-black/[0.08]',
            compact ? 'h-8 w-8' : 'h-9 w-9',
          )}
        >
          {logo ? (
            <img src={logo} alt="" className="h-full w-full object-contain p-0.5" />
          ) : (
            <span className={cn('font-bold text-primary', compact ? 'text-xs' : 'text-sm')}>{initial}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'truncate font-semibold leading-tight',
              compact ? 'text-xs' : 'text-sm',
              isDark ? 'text-foreground' : 'text-[hsl(228,32%,8%)]',
            )}
          >
            {name}
          </p>
          <p className={cn('text-[9px]', isDark ? 'text-muted-foreground' : 'text-[hsl(228,20%,42%)]')}>
            Workspace
          </p>
        </div>
      </div>
    </div>
  );
}
