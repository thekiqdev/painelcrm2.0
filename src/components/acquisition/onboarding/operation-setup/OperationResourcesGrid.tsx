import { cn } from '@/lib/utils';
import { MOBILE_RESOURCE_CHIPS, OPERATION_RESOURCES, RESOURCE_STATUS_LABEL } from './operationBuilderConstants';
import type { ResourceStatus } from './operationBuilderConstants';

function statusStyles(status: ResourceStatus) {
  switch (status) {
    case 'active':
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400';
    case 'preview':
      return 'border-violet-500/25 bg-violet-500/10 text-violet-300';
    case 'coming_soon':
      return 'border-white/10 bg-white/[0.03] text-muted-foreground';
  }
}

export function OperationResourcesGrid() {
  return (
    <section className="space-y-2 lg:space-y-3" aria-labelledby="op-resources-heading">
      <h2 id="op-resources-heading" className="text-sm font-semibold text-foreground">
        Recursos
      </h2>

      <div className="flex flex-wrap gap-1.5 lg:hidden">
        {MOBILE_RESOURCE_CHIPS.map((chip) => (
          <span
            key={chip.id}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] font-medium',
              chip.tone === 'active' && 'border-white/10 bg-white/[0.04] text-foreground',
              chip.tone === 'preview' && 'border-violet-500/25 bg-violet-500/10 text-violet-200',
            )}
          >
            {chip.label}
          </span>
        ))}
      </div>

      <div className="hidden grid-cols-2 gap-1.5 lg:grid">
        {OPERATION_RESOURCES.filter((r) => r.id !== 'multi').map((r) => {
          const Icon = r.icon;
          return (
            <div
              key={r.id}
              className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-primary/75" />
              <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">{r.name}</p>
              <span
                className={cn(
                  'shrink-0 rounded border px-1 py-0.5 text-[8px] font-medium uppercase',
                  statusStyles(r.status),
                )}
              >
                {RESOURCE_STATUS_LABEL[r.status]}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
