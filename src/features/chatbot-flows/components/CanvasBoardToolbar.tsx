import {
  ArrowRight,
  Hand,
  MousePointer2,
  StickyNote,
  Type,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BoardTool } from '../lib/canvasAnnotations';

type Props = {
  tool: BoardTool;
  onToolChange: (tool: BoardTool) => void;
};

const TOOLS: Array<{
  id: BoardTool;
  label: string;
  shortcut: string;
  Icon: typeof MousePointer2;
}> = [
  { id: 'select', label: 'Selecionar', shortcut: '1', Icon: MousePointer2 },
  { id: 'hand', label: 'Mover quadro', shortcut: '2', Icon: Hand },
  { id: 'sticky', label: 'Sticky note', shortcut: '3', Icon: StickyNote },
  { id: 'arrow', label: 'Seta', shortcut: '4', Icon: ArrowRight },
  { id: 'text', label: 'Texto', shortcut: '5', Icon: Type },
];

/** Barra superior estilo Excalidraw — anotações do canvas. */
export function CanvasBoardToolbar({ tool, onToolChange }: Props) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2">
      <div
        className="pointer-events-auto flex items-center gap-0.5 rounded-xl border bg-background/95 px-1.5 py-1 shadow-lg backdrop-blur-sm"
        role="toolbar"
        aria-label="Ferramentas do quadro"
      >
        {TOOLS.map((t, i) => {
          const active = tool === t.id;
          const Icon = t.Icon;
          const showSep = i === 2;
          return (
            <div key={t.id} className="flex items-center">
              {showSep ? <div className="mx-1 h-6 w-px bg-border" /> : null}
              <button
                type="button"
                title={`${t.label} (${t.shortcut})`}
                aria-label={t.label}
                aria-pressed={active}
                onClick={() => onToolChange(t.id)}
                className={cn(
                  'relative flex h-9 w-9 items-center justify-center rounded-lg transition',
                  active
                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-200'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
                <span className="absolute bottom-0.5 right-1 text-[9px] font-medium opacity-60">
                  {t.shortcut}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
