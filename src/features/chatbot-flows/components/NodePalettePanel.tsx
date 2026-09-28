import { Play, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PaletteNodeType } from '../lib/nodeCategories';
import {
  NODE_PALETTE_CATEGORIES,
  REACTFLOW_DND_TYPE,
  paletteItemLabel,
} from '../lib/nodeCategories';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (type: PaletteNodeType) => void;
  /** Posição na tela (clientX/Y) para menu flutuante no clique direito. */
  menuPosition?: { x: number; y: number } | null;
  testOpen?: boolean;
  onTestOpenChange?: (open: boolean) => void;
};

function PaletteCatalog({
  onPick,
  onClose,
}: {
  onPick: (type: PaletteNodeType) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div>
          <p className="text-sm font-medium">Adicionar nó</p>
          <p className="text-[11px] text-muted-foreground">Arraste para o canvas ou clique</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Fechar">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="max-h-[min(62vh,460px)] space-y-4 overflow-auto p-3">
        {NODE_PALETTE_CATEGORIES.map((cat) => (
          <section key={cat.id}>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {cat.label}
            </h3>
            <p className="mb-2 text-[11px] text-muted-foreground">{cat.description}</p>
            <div className="grid grid-cols-2 gap-2">
              {cat.types.map((type) => (
                <button
                  key={type}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(REACTFLOW_DND_TYPE, type);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={() => {
                    onPick(type);
                    onClose();
                  }}
                  className={cn(
                    'rounded-lg border bg-card px-2.5 py-2.5 text-left text-sm font-medium',
                    'shadow-sm transition hover:border-primary/40 hover:bg-muted/50',
                    'cursor-grab active:cursor-grabbing'
                  )}
                >
                  {paletteItemLabel(type)}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/** Flutuante sobre o canvas — nós de fluxo + teste (anotações ficam na barra superior). */
export function NodePalettePanel({
  open,
  onOpenChange,
  onPick,
  menuPosition = null,
  testOpen,
  onTestOpenChange,
}: Props) {
  const floating = open && menuPosition != null;

  return (
    <>
      <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col items-start gap-2">
        <div className="pointer-events-auto flex flex-col items-start gap-2">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              className={cn(
                'h-10 w-10 rounded-full shadow-md transition-transform duration-200',
                open && !floating && 'scale-95 ring-2 ring-primary/30'
              )}
              onClick={() => onOpenChange(!open)}
              title={open ? 'Fechar nós' : 'Adicionar nó'}
              aria-label={open ? 'Fechar nós' : 'Adicionar nó'}
              aria-expanded={open}
            >
              <Plus
                className={cn(
                  'h-5 w-5 transition-transform duration-300 ease-out',
                  open && !floating && 'rotate-45'
                )}
              />
            </Button>
            {!open ? (
              <span className="rounded-md bg-background/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm backdrop-blur-sm">
                Nós
              </span>
            ) : null}
          </div>

          {onTestOpenChange ? (
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant={testOpen ? 'default' : 'secondary'}
                className={cn(
                  'h-10 w-10 rounded-full shadow-md',
                  testOpen && 'ring-2 ring-emerald-500/40'
                )}
                onClick={() => {
                  onOpenChange(false);
                  onTestOpenChange(!testOpen);
                }}
                title={testOpen ? 'Fechar teste' : 'Testar fluxo'}
                aria-label={testOpen ? 'Fechar teste' : 'Testar fluxo'}
                aria-expanded={Boolean(testOpen)}
              >
                <Play className="h-5 w-5" />
              </Button>
              {!testOpen ? (
                <span className="rounded-md bg-background/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm backdrop-blur-sm">
                  Testar
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Menu docked sob o botão + (quando não é context menu) */}
        <div
          className={cn(
            'pointer-events-auto w-72 origin-top-left overflow-hidden rounded-xl border bg-background/95 shadow-lg backdrop-blur-sm',
            'transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            open && !floating
              ? 'max-h-[min(70vh,520px)] translate-y-0 scale-100 opacity-100'
              : 'pointer-events-none max-h-0 -translate-y-2 scale-95 opacity-0 border-transparent shadow-none'
          )}
          aria-hidden={!open || floating}
        >
          <PaletteCatalog onPick={onPick} onClose={() => onOpenChange(false)} />
        </div>
      </div>

      {/* Menu no ponto do clique direito */}
      {floating ? (
        <div
          className="pointer-events-auto fixed z-[60] w-72 max-h-[min(70vh,520px)] overflow-hidden rounded-xl border bg-background/95 shadow-xl backdrop-blur-sm"
          style={{
            left: Math.min(menuPosition.x, window.innerWidth - 300),
            top: Math.min(menuPosition.y, window.innerHeight - 120),
          }}
          role="menu"
          aria-label="Adicionar nó"
        >
          <PaletteCatalog onPick={onPick} onClose={() => onOpenChange(false)} />
        </div>
      ) : null}
    </>
  );
}
