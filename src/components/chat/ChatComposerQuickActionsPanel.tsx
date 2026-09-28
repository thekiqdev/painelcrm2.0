import type { ReactNode } from 'react';
import { memo, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Plus, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type ChatComposerQuickActionEntry = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  disabledReason?: string;
  /** Termos extra para a busca (sinónimos, nomes curtos) */
  searchAliases?: string[];
};

export type ChatComposerQuickActionSection = {
  id: string;
  title: string;
  items: ChatComposerQuickActionEntry[];
};

function foldDiacritics(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function actionSearchText(entry: ChatComposerQuickActionEntry, sectionTitle: string): string {
  const aliases = (entry.searchAliases ?? []).join(' ');
  return `${entry.label} ${entry.description} ${sectionTitle} ${entry.id} ${aliases}`;
}

const ChatQuickActionCompact = memo(function ChatQuickActionCompact({
  entry,
  onPick,
}: {
  entry: ChatComposerQuickActionEntry;
  onPick: () => void;
}) {
  const blocked = Boolean(entry.disabled);
  const titleHint = blocked
    ? (entry.disabledReason ?? 'Indisponível')
    : entry.description?.trim()
      ? `${entry.label} — ${entry.description}`
      : entry.label;
  const Icon = entry.icon;

  const inner = (
    <button
      type="button"
      disabled={blocked}
      title={titleHint}
      aria-label={entry.description ? `${entry.label}. ${entry.description}` : entry.label}
      className={cn(
        'flex w-full min-h-[2.75rem] flex-col items-center justify-center gap-0.5 rounded-lg border border-border/55 bg-muted/20 px-1.5 py-1.5 text-center transition-colors duration-150',
        'hover:border-primary/30 hover:bg-muted/55 active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        blocked && 'cursor-not-allowed opacity-45 hover:border-border/55 hover:bg-muted/20 active:scale-100',
      )}
      onClick={() => {
        if (blocked) return;
        onPick();
      }}
    >
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="line-clamp-2 w-full text-[11px] font-medium leading-tight text-foreground">
        {entry.label}
      </span>
    </button>
  );

  if (blocked && entry.disabledReason) {
    return (
      <Tooltip delayDuration={250}>
        <TooltipTrigger asChild>
          <span className="block w-full">{inner}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-xs">
          {entry.disabledReason}
        </TooltipContent>
      </Tooltip>
    );
  }

  return inner;
});

export function ChatComposerQuickActionsPanel({
  sections,
  triggerLabel = 'Ações rápidas',
  sendBlocked = false,
  triggerClassName,
  contentClassName,
  align = 'start',
  side = 'top',
  searchPlaceholder = 'Buscar…',
  showSearch = true,
  density = 'default',
  headerTitle = 'Ações rápidas',
  /** Secção opcional no topo da área scrollável (ex.: mensagens agendadas). */
  panelScrollTopSlot,
}: {
  sections: ChatComposerQuickActionSection[];
  triggerLabel?: string;
  sendBlocked?: boolean;
  triggerClassName?: string;
  contentClassName?: string;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom';
  searchPlaceholder?: string;
  showSearch?: boolean;
  /** compact = floating / menos altura; default = chat principal */
  density?: 'default' | 'compact';
  headerTitle?: string;
  panelScrollTopSlot?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filteredSections = useMemo(() => {
    const q = foldDiacritics(query.trim());
    if (!q) return sections;
    return sections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((it) => {
          const hay = foldDiacritics(actionSearchText(it, sec.title));
          return hay.includes(q);
        }),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [sections, query]);

  const flatCount = useMemo(
    () => filteredSections.reduce((n, s) => n + s.items.length, 0),
    [filteredSections],
  );

  const handleSelect = (fn: () => void) => {
    fn();
    setOpen(false);
    setQuery('');
  };

  const isCompact = density === 'compact';
  /** Limite do painel inteiro (flex col): sem isto, dentro de Sheet/ScrollArea o bloco interno não faz scroll. */
  const panelMaxHeight = isCompact
    ? 'max-h-[min(72dvh,380px)]'
    : 'max-h-[min(85dvh,520px)]';
  const panelWidth = isCompact
    ? 'w-[min(calc(100vw-1rem),300px)]'
    : 'w-[min(calc(100vw-1rem),360px)]';

  return (
    <TooltipProvider delayDuration={250}>
      {/* modal={false} reduz saltos de foco/layout típicos do modo modal ao abrir */}
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={sendBlocked}
            title={triggerLabel}
            aria-label={triggerLabel}
            aria-expanded={open}
            aria-haspopup="dialog"
            className={cn(
              'shrink-0 rounded-xl border-primary/15 bg-background shadow-sm ring-1 ring-border/40 transition-all duration-150',
              isCompact ? 'h-9 w-9' : 'h-10 w-10',
              'hover:border-primary/25 hover:bg-muted/40 hover:shadow-md',
              'active:scale-[0.97]',
              'focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2',
              sendBlocked && 'opacity-50',
              triggerClassName,
            )}
          >
            <Plus
              className={cn('text-primary', isCompact ? 'h-4 w-4' : 'h-[1.15rem] w-[1.15rem]')}
              strokeWidth={2.25}
              aria-hidden
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={10}
          className={cn(
            panelWidth,
            panelMaxHeight,
            'flex flex-col overflow-hidden border-border/70 bg-popover p-0 shadow-md',
            /* `ui/popover` traz zoom+slide por defeito — dupla animação = flicker ao posicionar */
            'data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100',
            'data-[side=bottom]:slide-in-from-top-0 data-[side=top]:slide-in-from-bottom-0',
            'data-[side=left]:slide-in-from-right-0 data-[side=right]:slide-in-from-left-0',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:duration-100 data-[state=closed]:duration-75',
            contentClassName,
          )}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="shrink-0 border-b border-border/50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{headerTitle}</p>
            {showSearch ? (
              <div className="relative mt-1.5">
                <Search
                  className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-8 rounded-md border-border/60 bg-muted/25 py-1 pl-8 text-xs placeholder:text-muted-foreground/80"
                  aria-label={searchPlaceholder}
                  autoComplete="off"
                />
              </div>
            ) : null}
          </div>

          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y px-2.5 pb-2.5 pt-2',
              '[scrollbar-width:thin]',
            )}
            onWheel={(e) => e.stopPropagation()}
          >
            {panelScrollTopSlot ? (
              <div className="mb-2 border-b border-border/40 pb-2">{panelScrollTopSlot}</div>
            ) : null}
            {filteredSections.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                {flatCount === 0 && query.trim()
                  ? 'Nenhuma ação corresponde à pesquisa.'
                  : 'Nenhuma ação disponível neste contexto.'}
              </p>
            ) : (
              <div className="space-y-3">
                {filteredSections.map((sec) => (
                  <section key={sec.id} aria-labelledby={`qa-sec-${sec.id}`}>
                    <h3
                      id={`qa-sec-${sec.id}`}
                      className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/90"
                    >
                      {sec.title}
                    </h3>
                    <div className="grid grid-cols-2 gap-1.5">
                      {sec.items.map((item) => (
                        <ChatQuickActionCompact
                          key={item.id}
                          entry={item}
                          onPick={() => handleSelect(item.onSelect)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
