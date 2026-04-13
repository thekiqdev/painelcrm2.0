import { Plus, SlidersHorizontal, ChevronRight } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ChatKanbanBoardCard, ChatKanbanColumn } from '@/services/chatKanban';
import { ChatKanbanSortableCard } from '@/components/chat-kanban/ChatKanbanSortableCard';
import { kanbanColumnDropId } from '@/components/chat-kanban/kanbanDndIds';
import { hasKanbanColumnAutomationIndicators, parseKanbanColumnRules } from '@/utils/kanbanColumnRulesUi';

type Props = {
  column: ChatKanbanColumn;
  /** Ordem visual atual (DnD); pode divergir de `card.column_id` durante o arraste. */
  cardIds: string[];
  cardMap: Map<string, ChatKanbanBoardCard>;
  onCardClick: (card: ChatKanbanBoardCard) => void;
  onAddCard: () => void;
  onConfigureColumn: (column: ChatKanbanColumn) => void;
};

export function ChatKanbanBoardColumn({
  column,
  cardIds,
  cardMap,
  onCardClick,
  onAddCard,
  onConfigureColumn,
}: Props) {
  const dropId = kanbanColumnDropId(column.id);
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const rules = parseKanbanColumnRules(column.metadata);
  const showRulesIcon = hasKanbanColumnAutomationIndicators(rules);
  const headerTinted = Boolean(column.color?.startsWith('bg-'));

  const orderedCards = cardIds
    .map((id) => cardMap.get(id))
    .filter((c): c is ChatKanbanBoardCard => c != null);

  const headerClass = column.color?.startsWith('bg-')
    ? `${column.color} text-white border-0`
    : 'bg-muted/80 text-foreground border-b';

  return (
    <Card
      className={cn(
        'flex-shrink-0 w-[280px] flex flex-col max-h-[calc(100vh-12rem)] border-border/80 shadow-sm transition-[box-shadow,ring]',
        isOver && 'ring-2 ring-primary/20 shadow-md',
      )}
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
                <SlidersHorizontal
                  className={cn('h-3.5 w-3.5 shrink-0 opacity-70', headerTinted && 'text-white/90')}
                  aria-hidden
                  title="Automações configuradas"
                />
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
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0 bg-muted/10 flex flex-col">
        <ScrollArea className="flex-1 min-h-0 h-[min(480px,calc(100vh-18rem))] [&_[data-radix-scroll-area-viewport]]:!block">
          <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
            <div
              ref={setNodeRef}
              className={cn(
                'p-2 space-y-2 min-h-[120px] rounded-md transition-colors',
                isOver && orderedCards.length > 0 && 'bg-primary/5',
              )}
            >
              {orderedCards.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/50 bg-background/40 px-3 py-5 text-center space-y-2">
                  <p className="text-xs text-muted-foreground">Nenhum cartão nesta etapa.</p>
                  <p className="text-[10px] text-muted-foreground/90">
                    Arraste uma conversa de outra coluna ou adicione pelo botão abaixo.
                  </p>
                  <Button type="button" variant="secondary" size="sm" className="w-full gap-1" onClick={onAddCard}>
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar conversa
                  </Button>
                </div>
              ) : (
                orderedCards.map((c) => (
                  <ChatKanbanSortableCard key={c.id} card={c} onCardClick={onCardClick} />
                ))
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
    </Card>
  );
}
