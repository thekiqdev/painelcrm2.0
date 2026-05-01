import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ChatKanbanBoardCard } from '@/services/chatKanban';
import { ChatKanbanCard } from '@/components/chat-kanban/ChatKanbanCard';

type Props = {
  card: ChatKanbanBoardCard;
  /** Metadata da coluna do cartão (ex.: `kanban_proposals`). */
  columnMetadata?: Record<string, unknown> | null;
  onCardClick: (card: ChatKanbanBoardCard) => void;
  pulseUnreadHighlight?: boolean;
};

export function ChatKanbanSortableCard({
  card,
  columnMetadata,
  onCardClick,
  pulseUnreadHighlight,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'kanban-card' },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative touch-none">
      <ChatKanbanCard
        card={card}
        columnMetadata={columnMetadata}
        onClick={() => onCardClick(card)}
        dragHandleProps={{ ...attributes, ...listeners }}
        pulseUnreadHighlight={pulseUnreadHighlight}
      />
      {isDragging ? (
        <div
          className="absolute inset-0 rounded-lg bg-muted/40 border border-dashed border-primary/25 pointer-events-none"
          aria-hidden
        />
      ) : null}
    </div>
  );
}
