import React, { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { GripVertical, RotateCcw, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type DashboardQuickActionContext,
  type DashboardQuickActionId,
  type DashboardQuickActionsPrefsV1,
  DASHBOARD_QUICK_ACTION_DEFS,
  buildPrefsFromState,
  computeOrderedQuickActions,
  isQuickActionVisible,
  resolveQuickActionRuntime,
} from "@/lib/dashboardQuickActions";

type DisplayItem = {
  id: DashboardQuickActionId;
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
};

type Props = {
  ctx: DashboardQuickActionContext;
  prefs: DashboardQuickActionsPrefsV1 | null;
  setPrefs: (p: DashboardQuickActionsPrefsV1 | null) => void;
  resetPrefs: () => void;
};

function SortableCustomizeRow({
  id,
  label,
  icon: Icon,
  tone,
  enabled,
  onEnabledChange,
}: {
  id: DashboardQuickActionId;
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

  const switchId = `qa-toggle-${id}`;

  // DnD só na alça: MouseSensor (rato) + TouchSensor (toque); `touchAction` inline ajuda iOS/WebKit (dnd-kit#435).
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
          aria-label={enabled ? `Ocultar ${label} do dashboard` : `Mostrar ${label} no dashboard`}
        />
      </div>
    </div>
  );
}

export function DashboardQuickActionsPanel({ ctx, prefs, setPrefs, resetPrefs }: Props) {
  const [customizeOpen, setCustomizeOpen] = useState(false);
  /** Ordem de todas as linhas no diálogo (activos + inactivos). */
  const [draftUiOrder, setDraftUiOrder] = useState<DashboardQuickActionId[]>([]);
  const [draftDisabled, setDraftDisabled] = useState<DashboardQuickActionId[]>([]);

  const ordered = useMemo(() => computeOrderedQuickActions(ctx, prefs), [ctx, prefs]);

  const visibleDefs = useMemo(() => DASHBOARD_QUICK_ACTION_DEFS.filter((d) => isQuickActionVisible(d, ctx)), [ctx]);

  const openCustomize = useCallback(() => {
    const active = computeOrderedQuickActions(ctx, prefs).map((x) => x.id);
    const visibleIds = new Set(visibleDefs.map((d) => d.id));
    const disabled =
      prefs?.disabledIds && prefs.disabledIds.length > 0
        ? prefs.disabledIds.filter((id) => visibleIds.has(id))
        : visibleDefs.map((d) => d.id).filter((id) => !active.includes(id));
    const defIndex = (id: DashboardQuickActionId) => visibleDefs.findIndex((d) => d.id === id);
    const disabledSorted = [...disabled].sort((a, b) => defIndex(a) - defIndex(b));
    setDraftUiOrder([...active, ...disabledSorted.filter((id) => !active.includes(id))]);
    setDraftDisabled(disabled);
    setCustomizeOpen(true);
  }, [ctx, prefs, visibleDefs]);

  const applyDraft = useCallback(() => {
    const enabledOrder = draftUiOrder.filter((id) => !draftDisabled.includes(id));
    setPrefs(buildPrefsFromState(enabledOrder, draftDisabled));
    setCustomizeOpen(false);
  }, [draftUiOrder, draftDisabled, setPrefs]);

  /** Mouse para desktop; Touch para mobile — `PointerSensor` falha frequentemente em touch (dnd-kit#435). */
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const oldIndex = draftUiOrder.indexOf(active.id as DashboardQuickActionId);
      const newIndex = draftUiOrder.indexOf(over.id as DashboardQuickActionId);
      if (oldIndex < 0 || newIndex < 0) return;
      setDraftUiOrder(arrayMove(draftUiOrder, oldIndex, newIndex));
    },
    [draftUiOrder],
  );

  const toggleId = useCallback((id: DashboardQuickActionId, enabled: boolean) => {
    if (enabled) {
      setDraftDisabled((d) => d.filter((x) => x !== id));
    } else {
      setDraftDisabled((d) => (d.includes(id) ? d : [...d, id]));
    }
  }, []);

  const itemsForDisplay: DisplayItem[] = useMemo(
    () =>
      ordered.map((x) => ({
        id: x.id,
        label: x.label,
        to: x.to,
        icon: x.icon,
        tone: x.tone,
      })),
    [ordered],
  );

  if (itemsForDisplay.length === 0) return null;

  return (
    <>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight md:text-lg">Atalhos rápidos</h2>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">Ações frequentes</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5 rounded-full px-3"
              onClick={openCustomize}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Personalizar</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {itemsForDisplay.map((shortcut) => (
            <Link
              key={shortcut.id}
              to={shortcut.to}
              className="group min-h-[4.5rem] rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-transform active:scale-[0.98] md:hover:-translate-y-0.5 md:hover:shadow-md"
            >
              <div className={`inline-flex rounded-xl p-2 ${shortcut.tone}`}>
                <shortcut.icon className="h-5 w-5" aria-hidden />
              </div>
              <p className="mt-2 text-sm font-medium leading-snug">{shortcut.label}</p>
            </Link>
          ))}
        </div>
      </section>

      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent className="!flex max-h-[min(90dvh,36rem)] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 border-b border-border px-4 py-3 text-left">
            <DialogTitle>Personalizar atalhos</DialogTitle>
            <DialogDescription>
              Arraste pela alça para reordenar. Use o interruptor para mostrar ou ocultar cada atalho no dashboard. As
              alterações guardam-se neste dispositivo para a sua conta.
            </DialogDescription>
          </DialogHeader>

          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 [-webkit-overflow-scrolling:touch]">
              <SortableContext items={draftUiOrder} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {draftUiOrder.map((id) => {
                    const def = DASHBOARD_QUICK_ACTION_DEFS.find((d) => d.id === id);
                    if (!def) return null;
                    const run = resolveQuickActionRuntime(def, ctx);
                    if (!run) return null;
                    const enabled = !draftDisabled.includes(id);
                    return (
                      <SortableCustomizeRow
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
                setCustomizeOpen(false);
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Repor padrão
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setCustomizeOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={applyDraft}>
                Guardar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
