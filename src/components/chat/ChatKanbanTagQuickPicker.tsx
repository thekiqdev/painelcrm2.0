import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  CHAT_TAG_COLOR_PALETTE,
  DEFAULT_CHAT_TAG_COLOR,
  normalizeHexColor,
} from '@/lib/chatKanbanTagStyle';
import type { ChatKanbanTagUi } from '@/services/chat';

export type ChatKanbanTagQuickPickerProps = {
  tenantOptions: ChatKanbanTagUi[];
  tenantLoading: boolean;
  busy: boolean;
  conversationKanbanTags: ChatKanbanTagUi[];
  onAddTag: (opts: { tagId?: string; newLabel?: string; newColor?: string }) => Promise<void>;
  triggerClassName?: string;
  align?: 'start' | 'center' | 'end';
  disabled?: boolean;
  title?: string;
  'aria-label'?: string;
};

export function ChatKanbanTagQuickPicker({
  tenantOptions,
  tenantLoading,
  busy,
  conversationKanbanTags,
  onAddTag,
  triggerClassName,
  align = 'start',
  disabled = false,
  title = 'Adicionar tag',
  'aria-label': ariaLabel = 'Adicionar tag Kanban à conversa',
}: ChatKanbanTagQuickPickerProps) {
  const [open, setOpen] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftColor, setDraftColor] = useState(DEFAULT_CHAT_TAG_COLOR);
  const [hexDraft, setHexDraft] = useState(DEFAULT_CHAT_TAG_COLOR);
  const customColorInputRef = useRef<HTMLInputElement>(null);

  const onConv = useMemo(() => new Set(conversationKanbanTags.map((t) => t.id)), [conversationKanbanTags]);
  const available = useMemo(
    () => tenantOptions.filter((t) => !onConv.has(t.id)),
    [tenantOptions, onConv],
  );

  useEffect(() => {
    if (!open) {
      setCreateMode(false);
      setDraftLabel('');
      setDraftColor(DEFAULT_CHAT_TAG_COLOR);
      setHexDraft(DEFAULT_CHAT_TAG_COLOR);
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn('h-5 w-5 shrink-0 rounded-full p-0', triggerClassName)}
          disabled={disabled || busy}
          title={title}
          aria-label={ariaLabel}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-[min(20rem,calc(100vw-2rem))] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {!createMode ? (
          <div className="flex max-h-[min(320px,55vh)] flex-col">
            <div className="border-b border-border/80 px-3 py-2">
              <p className="text-xs font-medium text-foreground">Tags existentes</p>
            </div>
            <ScrollArea className="max-h-52">
              <div className="p-2">
                {tenantLoading ? (
                  <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">A carregar…</p>
                ) : available.length === 0 ? (
                  <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                    {tenantOptions.length === 0
                      ? 'Ainda não há tags no tenant. Use «Criar nova tag».'
                      : 'Todas as tags já estão nesta conversa.'}
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {available.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                          disabled={busy}
                          onClick={async () => {
                            try {
                              await onAddTag({ tagId: t.id });
                              setOpen(false);
                            } catch {
                              /* toast no pai */
                            }
                          }}
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full border border-border/60"
                            style={{ backgroundColor: t.color ?? DEFAULT_CHAT_TAG_COLOR }}
                            aria-hidden
                          />
                          <span className="truncate">{t.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </ScrollArea>
            <Separator />
            <div className="p-2">
              <Button
                type="button"
                variant="secondary"
                className="h-8 w-full gap-1 text-xs"
                size="sm"
                disabled={busy}
                onClick={() => setCreateMode(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Criar nova tag
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 h-8 px-2 text-xs"
              onClick={() => setCreateMode(false)}
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" />
              Voltar à lista
            </Button>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Nome da tag</Label>
              <Input
                className="h-9 text-xs"
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                placeholder="Ex.: Urgente"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">Cor</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {CHAT_TAG_COLOR_PALETTE.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    title={p.name}
                    className={cn(
                      'h-6 w-6 rounded-full border-2 transition-transform hover:scale-105',
                      draftColor === p.value ? 'border-foreground ring-1 ring-ring' : 'border-transparent',
                    )}
                    style={{ backgroundColor: p.value }}
                    onClick={() => {
                      setDraftColor(p.value);
                      setHexDraft(p.value);
                    }}
                  />
                ))}
                <input
                  ref={customColorInputRef}
                  type="color"
                  className="sr-only pointer-events-none h-px w-px opacity-0"
                  value={
                    /^#[0-9A-Fa-f]{6}$/.test(normalizeHexColor(hexDraft || draftColor))
                      ? normalizeHexColor(hexDraft || draftColor)
                      : DEFAULT_CHAT_TAG_COLOR
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraftColor(v);
                    setHexDraft(v);
                  }}
                  aria-hidden
                  tabIndex={-1}
                />
                <button
                  type="button"
                  title="Cor personalizada"
                  aria-label="Abrir seletor de cor personalizada"
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/45 bg-muted/30 text-muted-foreground hover:border-primary/70 hover:bg-muted/60',
                  )}
                  onClick={() => customColorInputRef.current?.click()}
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              </div>
              <Input
                className="h-9 font-mono text-xs"
                value={hexDraft}
                onChange={(e) => setHexDraft(e.target.value)}
                placeholder="#2563EB"
                maxLength={7}
                spellCheck={false}
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={busy || !draftLabel.trim()}
              onClick={async () => {
                const label = draftLabel.trim();
                if (!label) return;
                try {
                  await onAddTag({
                    newLabel: label,
                    newColor: normalizeHexColor(hexDraft || draftColor),
                  });
                  setOpen(false);
                } catch {
                  /* toast no pai */
                }
              }}
            >
              Criar e aplicar
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
