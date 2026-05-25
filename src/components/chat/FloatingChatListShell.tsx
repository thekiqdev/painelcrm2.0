import type { ReactNode } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { FLOATING_LIST_WIDTH_PX } from '@/features/floating-chat/constants';

type QuickFilter = 'all' | 'mine' | 'unread';

const scrollbarNone =
  '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

export type FloatingChatListShellProps = {
  className?: string;
  quick: QuickFilter;
  onQuickChange: (value: QuickFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenFullChat: () => void;
  isFetching?: boolean;
  hasCachedRows?: boolean;
  children: ReactNode;
};

/**
 * Shell instantâneo do float chat — header, filtros e busca aparecem
 * antes dos dados da API (mesma filosofia do ChatShell em /chat).
 */
export function FloatingChatListShell({
  className,
  quick,
  onQuickChange,
  search,
  onSearchChange,
  onOpenFullChat,
  isFetching,
  hasCachedRows,
  children,
}: FloatingChatListShellProps) {
  return (
    <div className={cn('floating-chat-list-shell', className)}>
      <div
        className={cn(
          'floating-conversation-list flex min-h-0 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950',
          className,
        )}
        style={{ width: FLOATING_LIST_WIDTH_PX }}
      >
        <div className="floating-conversation-list-header flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-semibold text-foreground">
            Conversas
            {isFetching && hasCachedRows ? (
              <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">· atualizando</span>
            ) : null}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            draggable={false}
            onClick={onOpenFullChat}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Central completa
          </Button>
        </div>
        <ListShellFilters quick={quick} onQuickChange={onQuickChange} />
        <div className="floating-conversation-list-search shrink-0 bg-neutral-50 px-3 pb-2 pt-1 dark:bg-slate-900">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar…"
              draggable={false}
              className="h-8 border-neutral-200 bg-white pl-8 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>
        <div
          className={cn(
            'floating-conversation-list-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white dark:bg-slate-950',
            scrollbarNone,
            'touch-pan-y',
          )}
        >
          <div className="px-2 pb-2 pt-0">{children}</div>
        </div>
      </div>
    </div>
  );
}

function ListShellFilters({
  quick,
  onQuickChange,
}: {
  quick: QuickFilter;
  onQuickChange: (value: QuickFilter) => void;
}) {
  return (
    <div className="floating-conversation-list-filters shrink-0 border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900">
      <Tabs value={quick} onValueChange={(v) => onQuickChange(v as QuickFilter)}>
        <TabsList className="grid h-8 w-full grid-cols-3 bg-muted/60">
          <TabsTrigger value="all" className="px-1 text-[11px]">
            Todas
          </TabsTrigger>
          <TabsTrigger value="mine" className="px-1 text-[11px]">
            Minhas
          </TabsTrigger>
          <TabsTrigger value="unread" className="px-1 text-[11px]">
            Não lidas
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

/** Skeleton do painel quando instâncias ainda não carregaram. */
export function FloatingChatListShellLoading({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950',
        className,
      )}
      style={{ width: FLOATING_LIST_WIDTH_PX }}
      aria-busy="true"
      aria-label="Carregando conversas"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2.5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="space-y-2 px-3 py-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}
