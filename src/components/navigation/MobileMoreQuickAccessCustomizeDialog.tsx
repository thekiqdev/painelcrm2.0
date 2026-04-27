import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { GripVertical, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type MobileMoreMenuContext,
  type MobileMoreQuickAccessPrefsV1,
  type MobileMoreQuickActionId,
  MOBILE_MORE_ITEM_DEFS,
  buildMobileMoreQuickAccessPrefsFromState,
  computeFullMobileQuickAccessOrder,
  isMobileMoreItemVisible,
  resolveMobileQuickAccessRuntime,
} from "@/lib/mobileMoreQuickAccess";

type Props = {
  ctx: MobileMoreMenuContext;
  prefs: MobileMoreQuickAccessPrefsV1 | null;
  setPrefs: (p: MobileMoreQuickAccessPrefsV1 | null) => void;
  resetPrefs: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function SortableRow({
  id,
  label,
  icon: Icon,
  tone,
  enabled,
  onEnabledChange,
}: {
  id: MobileMoreQuickActionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const switchId = `mobile-more-qa-${id}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm",
        isDragging && "z-10 opacity-90 ring-2 ring-primary/25",
        !enabled && "opacity-80",
      )}
    >
      <div
        className={cn(
          "flex min-h-11 min-w-11 shrink-0 select-none items-center justify-center rounded-lg text-muted-foreground hover:bg-muted",
          "touch-none cursor-grab active:cursor-grabbing",
        )}
        style={{ touchAction: "none" }}
        aria-label={`Arrastar ${label}`}
        role="button"
        tabIndex={0}
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-5 w-5" aria-hidden />
      </div>
      <div className={cn("inline-flex rounded-lg p-1.5", tone, "pointer-events-none")}>
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <span className="pointer-events-none min-w-0 flex-1 text-sm font-medium leading-snug">{label}</span>
      <div
        className="shrink-0 pl-1"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <Switch
          id={switchId}
          checked={enabled}
          onCheckedChange={(v) => onEnabledChange(v === true)}
          aria-label={enabled ? `Remover ${label} do acesso rápido` : `Incluir ${label} no acesso rápido`}
        />
      </div>
    </div>
  );
}

export function MobileMoreQuickAccessCustomizeDialog({
  ctx,
  prefs,
  setPrefs,
  resetPrefs,
  open,
  onOpenChange,
}: Props) {
  const [draftUiOrder, setDraftUiOrder] = useState<MobileMoreQuickActionId[]>([]);
  const [draftDisabled, setDraftDisabled] = useState<MobileMoreQuickActionId[]>([]);

  const visibleDefs = useMemo(() => MOBILE_MORE_ITEM_DEFS.filter((d) => isMobileMoreItemVisible(d, ctx)), [ctx]);

  useEffect(() => {
    if (!open) return;
    const active = computeFullMobileQuickAccessOrder(ctx, prefs);
    const visibleIds = new Set(visibleDefs.map((d) => d.id));
    const disabled =
      prefs?.disabledIds && prefs.disabledIds.length > 0
        ? prefs.disabledIds.filter((id) => visibleIds.has(id))
        : visibleDefs.map((d) => d.id).filter((id) => !active.includes(id));
    const defIndex = (id: MobileMoreQuickActionId) => visibleDefs.findIndex((d) => d.id === id);
    const disabledSorted = [...disabled].sort((a, b) => defIndex(a) - defIndex(b));
    setDraftUiOrder([...active, ...disabledSorted.filter((id) => !active.includes(id))]);
    setDraftDisabled(disabled);
  }, [open, ctx, prefs, visibleDefs]);

  const applyDraft = useCallback(() => {
    const enabledOrder = draftUiOrder.filter((id) => !draftDisabled.includes(id));
    setPrefs(buildMobileMoreQuickAccessPrefsFromState(enabledOrder, draftDisabled));
    onOpenChange(false);
  }, [draftUiOrder, draftDisabled, setPrefs, onOpenChange]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const oldIndex = draftUiOrder.indexOf(active.id as MobileMoreQuickActionId);
      const newIndex = draftUiOrder.indexOf(over.id as MobileMoreQuickActionId);
      if (oldIndex < 0 || newIndex < 0) return;
      setDraftUiOrder(arrayMove(draftUiOrder, oldIndex, newIndex));
    },
    [draftUiOrder],
  );

  const toggleId = useCallback((id: MobileMoreQuickActionId, enabled: boolean) => {
    if (enabled) {
      setDraftDisabled((d) => d.filter((x) => x !== id));
    } else {
      setDraftDisabled((d) => (d.includes(id) ? d : [...d, id]));
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!flex max-h-[min(90dvh,36rem)] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        aria-describedby={undefined}
      >
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 text-left">
          <DialogTitle>Personalizar acesso rápido</DialogTitle>
        </DialogHeader>

        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 [-webkit-overflow-scrolling:touch]">
            <SortableContext items={draftUiOrder} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {draftUiOrder.map((id) => {
                  const def = MOBILE_MORE_ITEM_DEFS.find((d) => d.id === id);
                  if (!def || !isMobileMoreItemVisible(def, ctx)) return null;
                  const run = resolveMobileQuickAccessRuntime(id);
                  if (!run) return null;
                  const enabled = !draftDisabled.includes(id);
                  return (
                    <SortableRow
                      key={id}
                      id={id}
                      label={run.label}
                      icon={run.icon}
                      tone={def.tone}
                      enabled={enabled}
                      onEnabledChange={(next) => toggleId(id, next)}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </div>
        </DndContext>

        <DialogFooter className="shrink-0 flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => {
              resetPrefs();
              onOpenChange(false);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Repor padrão
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={applyDraft}>
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
