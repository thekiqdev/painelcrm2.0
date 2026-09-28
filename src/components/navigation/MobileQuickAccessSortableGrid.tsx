import React, { useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { SheetClose } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { MobileMoreQuickActionId } from "@/lib/mobileMoreQuickAccess";

export type MobileQuickAccessGridItem = {
  id: MobileMoreQuickActionId;
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  preload?: () => Promise<unknown>;
};

type SortableTileProps = {
  item: MobileQuickAccessGridItem;
};

function SortableQuickTile({ item }: SortableTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("relative min-h-0", isDragging && "z-[80] opacity-[0.97]")}
    >
      <button
        type="button"
        className={cn(
          "absolute right-1 top-1 z-20 flex h-8 w-8 touch-none items-center justify-center rounded-lg",
          "border border-border/60 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm",
          "active:bg-muted",
        )}
        aria-label={`Mover «${item.label}»`}
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-4 w-4 shrink-0" aria-hidden />
      </button>
      <SheetClose asChild>
        <Link
          to={item.to}
          onMouseEnter={() => item.preload?.()}
          className={cn(
            "group flex min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-border/70 bg-card/90 p-2.5 pt-7 text-center shadow-sm ring-0 transition-all",
            "active:scale-[0.98] hover:border-primary/25 hover:bg-card hover:shadow-md",
            "dark:border-border/50 dark:bg-card/60 dark:hover:border-primary/30",
            isDragging && "pointer-events-none",
          )}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
            <item.icon className="h-5 w-5" aria-hidden />
          </div>
          <span className="line-clamp-2 w-full px-0.5 text-[12px] font-semibold leading-tight text-foreground">
            {item.label}
          </span>
        </Link>
      </SheetClose>
    </div>
  );
}

type Props = {
  items: MobileQuickAccessGridItem[];
  onOrderChange: (orderedIds: MobileMoreQuickActionId[]) => void;
};

export function MobileQuickAccessSortableGrid({ items, onOrderChange }: Props) {
  const ids = useMemo(() => items.map((i) => i.id), [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 10 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = ids.indexOf(active.id as MobileMoreQuickActionId);
      const newIndex = ids.indexOf(over.id as MobileMoreQuickActionId);
      if (oldIndex < 0 || newIndex < 0) return;
      onOrderChange(arrayMove(ids, oldIndex, newIndex));
    },
    [ids, onOrderChange],
  );

  if (items.length === 0) return null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {items.map((item) => (
            <SortableQuickTile key={item.id} item={item} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
