import { Plus, SlidersHorizontal, ChevronRight } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ChatKanbanBoardCard, ChatKanbanColumn } from '@/services/chatKanban';
import { ChatKanbanSortableCard } from '@/components/chat-kanban/ChatKanbanSortableCard';
import { kanbanColumnDropId } from '@/components/chat-kanban/kanbanDndIds';
import {
  hasKanbanColumnAutomationIndicators,
  parseKanbanColumnRules,
  parseKanbanProposalsDisplay,
} from '@/utils/kanbanColumnRulesUi';

export type ChatKanbanColumnNativeDropProps = {
  /** Hover de drag HTML5 vindo do chat (conversa). */
  nativeConversationDragOver: boolean;
  /** Título acessível na zona de drop durante o arraste. */
  nativeDropTitle?: string | null;
  onNativeDragEnter?: (e: React.DragEvent) => void;
  onNativeDragOver?: (e: React.DragEvent) => void;
  onNativeDragLeave?: (e: React.DragEvent) => void;
  onNativeDrop?: (e: React.DragEvent) => void;
};

type Props = {
  column: ChatKanbanColumn;
  /** Ordem visual atual (DnD); pode divergir de `card.column_id` durante o arraste. */
  cardIds: string[];
  cardMap: Map<string, ChatKanbanBoardCard>;
  onCardClick: (card: ChatKanbanBoardCard) => void;
  /** Remove só o cartão desta coluna (API delete do kanban card). */
  onRemoveCard?: (card: ChatKanbanBoardCard) => void;
  onAddCard: () => void;
  onConfigureColumn: (column: ChatKanbanColumn) => void;
  /** Drop nativo de conversa (chat / flutuante) → coluna. */
  nativeDrop?: ChatKanbanColumnNativeDropProps | null;
  /** `conversation_id` → timestamp até quando mostrar pulse de nova mensagem. */
  pulseUnreadUntilByConversationId?: Record<string, number>;
};

export function ChatKanbanBoardColumn({
  column,
  cardIds,
  cardMap,
  onCardClick,
  onRemoveCard,
  onAddCard,
  onConfigureColumn,
  nativeDrop,
  pulseUnreadUntilByConversationId,
}: Props) {
  const dropId = kanbanColumnDropId(column.id);
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const rules = parseKanbanColumnRules(column.metadata);
  const proposalDisplay = parseKanbanProposalsDisplay(column.metadata);
  const showRulesIcon = hasKanbanColumnAutomationIndicators(rules);
  const headerTinted = Boolean(column.color?.startsWith('bg-'));

  const orderedCards = cardIds
    .map((id) => cardMap.get(id))
    .filter((c): c is ChatKanbanBoardCard => c != null);

  let columnTotalPending = 0;
  let columnTotalAccepted = 0;
  for (const c of orderedCards) {
    if (proposalDisplay.show_pending) {
      columnTotalPending += Number(c.proposal_pending_total ?? 0);
    }
    if (proposalDisplay.show_accepted) {
      columnTotalAccepted += Number(c.proposal_accepted_total ?? 0);
    }
  }

  const showProposalColumnTotals =
    orderedCards.length > 0 && (proposalDisplay.show_pending || proposalDisplay.show_accepted);

  const formatBrl = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

  const headerClass = column.color?.startsWith('bg-')
    ? `${column.color} text-white border-0`
    : 'bg-muted/80 text-foreground border-b';

  const nativeOver = Boolean(nativeDrop?.nativeConversationDragOver);
  const dropZoneTitle =
    nativeDrop?.nativeDropTitle?.trim() ||
    (nativeOver ? 'Soltar para adicionar ou mover o cartão nesta etapa' : undefined);

  const nativeDragHandlers = nativeDrop
    ? {
        onDragEnter: nativeDrop.onNativeDragEnter,
        /** Bubble: hover visual em qualquer filho */
        onDragOver: nativeDrop.onNativeDragOver,
        /** Capture: garante `preventDefault` / `dropEffect` mesmo sobre botões, scroll, etc. */
        onDragOverCapture: nativeDrop.onNativeDragOver,
        onDragLeave: nativeDrop.onNativeDragLeave,
        onDrop: nativeDrop.onNativeDrop,
      }
    : {};

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'kanban-column flex h-full min-h-[min(500px,85dvh)] w-[280px] shrink-0 flex-col rounded-lg border border-border/80 bg-card text-card-foreground shadow-sm transition-[box-shadow,ring]',
        isOver && 'ring-2 ring-primary/20 shadow-md',
        nativeOver && 'ring-2 ring-emerald-500/35 shadow-md',
      )}
      title={dropZoneTitle ?? undefined}
      {...nativeDragHandlers}
    >
      <CardHeader className={`py-3 px-3 rounded-t-lg ${headerClass}`}>
        <button
          type="button"
          className={cn(
            'w-full text-left rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            headerTinted && 'focus-visible:ring-offset-0 focus-visible:ring-white/50',
          )}
          onClick={() => onConfigureColumn(column)}
          title="Configurar coluna"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-1.5">
              <span className="text-sm font-semibold truncate">{column.name}</span>
              <ChevronRight
                className={cn('h-3.5 w-3.5 shrink-0 opacity-50', headerTinted && 'text-white/80')}
                aria-hidden
              />
              {rules.is_terminal ? (
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 text-[10px] px-1.5 py-0 h-5 font-normal',
                    headerTinted ? 'border-white/40 bg-white/10 text-inherit' : 'opacity-90',
                  )}
                  title="Coluna terminal"
                >
                  terminal
                </Badge>
              ) : null}
              {showRulesIcon ? (
                <span title="Automações configuradas">
                  <SlidersHorizontal
                    className={cn('h-3.5 w-3.5 shrink-0 opacity-70', headerTinted && 'text-white/90')}
                    aria-hidden
                  />
                </span>
              ) : null}
            </div>
            <Badge
              variant="secondary"
              className={
                column.color?.startsWith('bg-')
                  ? 'bg-white/20 text-white border-white/30 hover:bg-white/25'
                  : ''
              }
            >
              {orderedCards.length}
            </Badge>
          </div>
        </button>
        {showProposalColumnTotals ? (
          <div
            className={
              headerTinted
                ? 'mt-2 pt-2 border-t border-white/25 text-[10px] tabular-nums leading-tight text-white/90 flex flex-wrap gap-x-3 gap-y-0.5'
                : 'mt-2 pt-2 border-t border-border/50 text-[10px] tabular-nums leading-tight text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5'
            }
          >
            {proposalDisplay.show_pending ? (
              <span title="Soma dos valores em propostas pendentes (enviadas) nos cartões desta coluna">
                Total pendente: {formatBrl(columnTotalPending)}
              </span>
            ) : null}
            {proposalDisplay.show_accepted ? (
              <span title="Soma dos valores em propostas aceitas ou faturadas nos cartões desta coluna">
                Total aceito: {formatBrl(columnTotalAccepted)}
              </span>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col bg-muted/10 p-0">
        <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]]:!block [&_[data-radix-scroll-area-viewport]]:max-h-full [&_[data-radix-scroll-area-viewport]]:min-h-[200px]">
          <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
            <div
              className={cn(
                'flex min-h-full flex-col gap-2 p-2 transition-colors',
                isOver && orderedCards.length > 0 && 'bg-primary/5',
                nativeOver && 'bg-emerald-500/10',
              )}
            >
              {orderedCards.length === 0 ? (
                <div className="flex min-h-[220px] flex-1 flex-col justify-center space-y-2 rounded-md border border-dashed border-border/50 bg-background/40 px-3 py-6 text-center">
                  <p className="text-xs text-muted-foreground">Nenhum cartão nesta etapa.</p>
                  <p className="text-[10px] text-muted-foreground/90">
                    Arraste uma conversa do chat, de outra coluna ou adicione pelo botão abaixo.
                  </p>
                  <Button type="button" variant="secondary" size="sm" className="w-full gap-1" onClick={onAddCard}>
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar conversa
                  </Button>
                </div>
              ) : (
                orderedCards.map((c) => {
                  const pulseUntil = pulseUnreadUntilByConversationId?.[c.conversation_id] ?? 0;
                  const pulseUnreadHighlight = pulseUntil > Date.now();
                  return (
                    <ChatKanbanSortableCard
                      key={c.id}
                      card={c}
                      columnMetadata={column.metadata}
                      onCardClick={onCardClick}
                      onRemoveCard={onRemoveCard}
                      pulseUnreadHighlight={pulseUnreadHighlight}
                    />
                  );
                })
              )}
            </div>
          </SortableContext>
        </ScrollArea>
        <div className="p-2 border-t border-border/40 bg-background/70 shrink-0">
          <Button type="button" variant="outline" size="sm" className="w-full gap-1 h-8 text-xs" onClick={onAddCard}>
            <Plus className="h-3.5 w-3.5" />
            Adicionar conversa
          </Button>
        </div>
      </CardContent>
    </div>
  );
}
