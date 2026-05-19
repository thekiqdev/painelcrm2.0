import React, { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { normalizeHexColor, contrastingTextForBg } from '@/lib/chatKanbanTagStyle';
import type { ChatKanbanTagUi } from '@/services/chat';

export type ChatAttendanceFilterValue = '' | 'queue' | 'team' | 'mine' | 'closed';

export type ChatSidebarTagFiltersProps = {
  tags: ChatKanbanTagUi[];
  tagCounts: ReadonlyMap<string, number>;
  selectedTagId: string | null;
  onSelectTag: (tagId: string | null) => void;
  loading?: boolean;
  className?: string;
  attendanceFilter: ChatAttendanceFilterValue;
  onAttendanceFilterChange: (value: ChatAttendanceFilterValue) => void;
  attendanceCounts: {
    queue: number;
    unassigned: number;
    mine: number;
    team: number;
    closed: number;
  };
  canViewQueue: boolean;
  showTeamFilter: boolean;
};

const CHIP_GAP_PX = 4;
const PLUS_BTN_WIDTH = 32;

function formatCount(n: number): string {
  return n > 99 ? '99+' : String(n);
}

function AttendanceChip({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors',
        active
          ? 'border-primary/30 bg-primary text-primary-foreground shadow-sm'
          : 'border-border/80 bg-background text-foreground hover:bg-muted/60',
      )}
    >
      {label}
      {count != null && count > 0 ? (
        <span
          className={cn(
            'tabular-nums rounded-full px-1.5 py-0 text-[10px] font-medium',
            active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {formatCount(count)}
        </span>
      ) : null}
    </button>
  );
}

function TagChip({
  tag,
  count,
  active,
  onClick,
  dataTagChip,
}: {
  tag: ChatKanbanTagUi;
  count: number;
  active: boolean;
  onClick: () => void;
  dataTagChip?: boolean;
}) {
  const bg = normalizeHexColor(tag.color);
  const fg = contrastingTextForBg(bg);
  return (
    <button
      type="button"
      data-tag-chip={dataTagChip ? '' : undefined}
      onClick={onClick}
      title={tag.label}
      className={cn(
        'inline-flex h-7 max-w-[120px] shrink-0 items-center gap-1 rounded-md border-2 px-2 text-[11px] font-medium transition-colors',
        active ? 'shadow-sm' : 'border-border/70 hover:bg-muted/50',
      )}
      style={
        active
          ? { backgroundColor: bg, color: fg, borderColor: bg }
          : undefined
      }
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: active ? fg : bg }}
        aria-hidden
      />
      <span className="truncate">{tag.label}</span>
      {count > 0 ? (
        <span
          className={cn(
            'shrink-0 tabular-nums text-[10px] opacity-80',
            active ? '' : 'text-muted-foreground',
          )}
        >
          {formatCount(count)}
        </span>
      ) : null}
    </button>
  );
}

function ChatSidebarTagFiltersInner({
  tags,
  tagCounts,
  selectedTagId,
  onSelectTag,
  loading = false,
  className,
  attendanceFilter,
  onAttendanceFilterChange,
  attendanceCounts,
  canViewQueue,
  showTeamFilter,
}: ChatSidebarTagFiltersProps) {
  const tagsViewportRef = useRef<HTMLDivElement>(null);
  const tagsRulerRef = useRef<HTMLDivElement>(null);
  const [visibleTagCount, setVisibleTagCount] = useState(tags.length);
  const [moreOpen, setMoreOpen] = useState(false);

  const queueCount = attendanceCounts.queue + attendanceCounts.unassigned;

  const handleToggleTag = useCallback(
    (tagId: string) => {
      const next = selectedTagId === tagId ? null : tagId;
      onSelectTag(next);
      if (next !== null) {
        onAttendanceFilterChange('');
      }
    },
    [onSelectTag, selectedTagId, onAttendanceFilterChange],
  );

  const toggleAttendance = useCallback(
    (value: ChatAttendanceFilterValue) => {
      const next = attendanceFilter === value ? '' : value;
      onAttendanceFilterChange(next);
      if (next !== '') {
        onSelectTag(null);
      }
    },
    [attendanceFilter, onAttendanceFilterChange, onSelectTag],
  );

  useLayoutEffect(() => {
    const viewport = tagsViewportRef.current;
    const ruler = tagsRulerRef.current;
    if (!viewport || !ruler || tags.length === 0) {
      setVisibleTagCount(tags.length);
      return;
    }

    const measure = () => {
      const maxWidth = viewport.clientWidth;
      if (maxWidth <= 0) {
        setVisibleTagCount(tags.length);
        return;
      }
      const chips = ruler.querySelectorAll<HTMLElement>('[data-tag-chip]');
      let used = 0;
      let count = 0;
      for (let i = 0; i < chips.length; i++) {
        const w = chips[i].offsetWidth + CHIP_GAP_PX;
        if (used + w > maxWidth && count > 0) break;
        used += w;
        count++;
      }
      setVisibleTagCount(Math.max(0, Math.min(count, tags.length)));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [tags]);

  const { visibleTags, overflowTags } = useMemo(() => {
    if (visibleTagCount >= tags.length) {
      return { visibleTags: tags, overflowTags: [] as ChatKanbanTagUi[] };
    }
    const visible = tags.slice(0, visibleTagCount);
    const visibleIds = new Set(visible.map((t) => t.id));
    const overflow = tags.filter((t) => !visibleIds.has(t.id));
    return { visibleTags: visible, overflowTags: overflow };
  }, [tags, visibleTagCount]);

  const showMoreButton =
    overflowTags.length > 0 || showTeamFilter || attendanceCounts.closed > 0 || tags.length > 0;

  if (loading) {
    return (
      <div className={cn('py-1', className)}>
        <p className="text-[11px] text-muted-foreground">A carregar filtros…</p>
      </div>
    );
  }

  return (
    <div className={cn('relative min-w-0 overflow-hidden', className)}>
      {/* Régua invisível para medir largura das tags */}
      {tags.length > 0 ? (
        <div
          ref={tagsRulerRef}
          className="pointer-events-none absolute -left-[9999px] top-0 flex gap-1 opacity-0"
          aria-hidden
        >
          {tags.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              count={tagCounts.get(tag.id) ?? 0}
              active={false}
              onClick={() => {}}
              dataTagChip
            />
          ))}
        </div>
      ) : null}

      <div className="flex min-w-0 items-center gap-1">
        {canViewQueue ? (
          <AttendanceChip
            label="Fila"
            active={attendanceFilter === 'queue'}
            count={queueCount}
            onClick={() => toggleAttendance('queue')}
          />
        ) : null}

        <AttendanceChip
          label="Minhas"
          active={attendanceFilter === 'mine'}
          count={attendanceCounts.mine}
          onClick={() => toggleAttendance('mine')}
        />

        {tags.length > 0 ? (
          <div
            ref={tagsViewportRef}
            className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
          >
            {visibleTags.map((tag) => (
              <TagChip
                key={tag.id}
                tag={tag}
                count={tagCounts.get(tag.id) ?? 0}
                active={selectedTagId === tag.id}
                onClick={() => handleToggleTag(tag.id)}
              />
            ))}
          </div>
        ) : (
          <div className="min-w-0 flex-1" />
        )}

        {showMoreButton ? (
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  'h-7 w-7 shrink-0 rounded-md',
                  moreOpen && 'border-primary/40 bg-primary/10',
                )}
                style={{ width: PLUS_BTN_WIDTH, minWidth: PLUS_BTN_WIDTH }}
                aria-label="Mais filtros e tags"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(280px,calc(100vw-2rem))] p-2">
              <div className="max-h-[min(320px,50vh)] space-y-2 overflow-y-auto">
                {overflowTags.length > 0 ? (
                  <div>
                    <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Tags
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {overflowTags.map((tag) => (
                        <TagChip
                          key={tag.id}
                          tag={tag}
                          count={tagCounts.get(tag.id) ?? 0}
                          active={selectedTagId === tag.id}
                          onClick={() => {
                            handleToggleTag(tag.id);
                            setMoreOpen(false);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                <div>
                  <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {showTeamFilter ? (
                      <AttendanceChip
                        label="Equipe"
                        active={attendanceFilter === 'team'}
                        count={attendanceCounts.team}
                        onClick={() => {
                          toggleAttendance('team');
                          setMoreOpen(false);
                        }}
                      />
                    ) : null}
                    <AttendanceChip
                      label="Encerradas"
                      active={attendanceFilter === 'closed'}
                      count={attendanceCounts.closed}
                      onClick={() => {
                        toggleAttendance('closed');
                        setMoreOpen(false);
                      }}
                    />
                    <AttendanceChip
                      label="Todas"
                      active={attendanceFilter === '' && !selectedTagId}
                      onClick={() => {
                        onAttendanceFilterChange('');
                        onSelectTag(null);
                        setMoreOpen(false);
                      }}
                    />
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
    </div>
  );
}

export const ChatSidebarTagFilters = memo(ChatSidebarTagFiltersInner);
