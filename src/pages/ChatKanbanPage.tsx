import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { GripHorizontal, LayoutGrid, Loader2, PanelTop, RefreshCw } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ChatKanbanToolbar } from '@/components/chat-kanban/ChatKanbanToolbar';
import { ChatKanbanBoardColumn } from '@/components/chat-kanban/ChatKanbanBoardColumn';
import { ChatKanbanCard } from '@/components/chat-kanban/ChatKanbanCard';
import { useChatKanbanBoardDnd } from '@/components/chat-kanban/useChatKanbanBoardDnd';
import { ChatKanbanAddCardDialog } from '@/components/chat-kanban/ChatKanbanAddCardDialog';
import { ChatKanbanColumnManagerDialog } from '@/components/chat-kanban/ChatKanbanColumnManagerDialog';
import { ChatKanbanEmptyState } from '@/components/chat-kanban/ChatKanbanEmptyState';
import { ChatKanbanMoveReasonDialog } from '@/components/chat-kanban/ChatKanbanMoveReasonDialog';
import { ChatKanbanMoveConfirmDialog } from '@/components/chat-kanban/ChatKanbanMoveConfirmDialog';
import { ChatKanbanColumnSettingsSheet } from '@/components/chat-kanban/ChatKanbanColumnSettingsSheet';
import { ChatKanbanBoardSettingsSheet } from '@/components/chat-kanban/ChatKanbanBoardSettingsSheet';
import {
  chatKanbanService,
  type ChatKanbanBoard,
  type ChatKanbanBoardCard,
  type ChatKanbanColumn,
} from '@/services/chatKanban';
import { parseKanbanColumnUi } from '@/utils/kanbanColumnRulesUi';
import { useAuth } from '@/contexts/AuthContext';
import { useKanbanAttendanceSocketRefresh } from '@/hooks/useKanbanAttendanceSocketRefresh';
import { useKanbanBoardRealtimeCards } from '@/hooks/useKanbanBoardRealtimeCards';
import { fetchFunnels } from '@/services/funnels';
import {
  dataTransferHasConversationDragMime,
  endConversationDragSession,
  getActiveConversationDrag,
  isNativeConversationDragActive,
  readConversationDragFromDataTransfer,
} from '@/lib/chatKanbanConversationDrag';
import { useFloatingChatOptional } from '@/features/floating-chat';
import { setStoredProposalPublicUrl } from '@/utils/proposalPublicLinkSession';

type FunnelOption = { id: string; name: string };

const ChatKanbanPage = () => {
  const { session } = useAuth();
  const floatingChat = useFloatingChatOptional();
  const [boards, setBoards] = useState<ChatKanbanBoard[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [columns, setColumns] = useState<ChatKanbanColumn[]>([]);
  const [cards, setCards] = useState<ChatKanbanBoardCard[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingBoardData, setLoadingBoardData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createLinkedFunnelId, setCreateLinkedFunnelId] = useState<string>('none');
  const [funnels, setFunnels] = useState<FunnelOption[]>([]);
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [columnManagerOpen, setColumnManagerOpen] = useState(false);
  const [addCardColumnId, setAddCardColumnId] = useState<string | null>(null);
  const [settingsColumn, setSettingsColumn] = useState<ChatKanbanColumn | null>(null);

  const moveReasonWaiterRef = useRef<{ resolve: (v: string | null) => void } | null>(null);
  const [moveReasonUi, setMoveReasonUi] = useState<{ columnName: string } | null>(null);

  const moveConfirmWaiterRef = useRef<{ resolve: (v: boolean) => void } | null>(null);
  const [moveConfirmUi, setMoveConfirmUi] = useState<{ columnName: string } | null>(null);

  const [nativeDragHoverColumnId, setNativeDragHoverColumnId] = useState<string | null>(null);
  const [attachMoveReason, setAttachMoveReason] = useState<{
    colId: string;
    convId: string;
    columnName: string;
  } | null>(null);
  const [attachMoveConfirm, setAttachMoveConfirm] = useState<{
    colId: string;
    convId: string;
    columnName: string;
  } | null>(null);

  const requestMoveReason = useCallback((args: { columnName: string }) => {
    return new Promise<string | null>((resolve) => {
      moveReasonWaiterRef.current = { resolve };
      setMoveReasonUi({ columnName: args.columnName });
    });
  }, []);

  const finishMoveReason = useCallback((reason: string | null) => {
    const w = moveReasonWaiterRef.current;
    moveReasonWaiterRef.current = null;
    setMoveReasonUi(null);
    w?.resolve(reason);
  }, []);

  const requestMoveConfirmation = useCallback((args: { columnName: string }) => {
    return new Promise<boolean>((resolve) => {
      moveConfirmWaiterRef.current = { resolve };
      setMoveConfirmUi({ columnName: args.columnName });
    });
  }, []);

  const finishMoveConfirm = useCallback((confirmed: boolean) => {
    const w = moveConfirmWaiterRef.current;
    moveConfirmWaiterRef.current = null;
    setMoveConfirmUi(null);
    w?.resolve(confirmed);
  }, []);

  const loadBoards = useCallback(async () => {
    setLoadingBoards(true);
    setError(null);
    try {
      const list = await chatKanbanService.listBoards(false);
      setBoards(list);
      setSelectedBoardId((prev) => {
        if (list.length === 0) return null;
        if (prev && list.some((b) => b.id === prev)) return prev;
        if (list.length === 1) return list[0].id;
        return list[0]?.id ?? null;
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar quadros';
      setError(msg);
      setBoards([]);
      setSelectedBoardId(null);
    } finally {
      setLoadingBoards(false);
    }
  }, []);

  const loadBoardDetail = useCallback(async (boardId: string) => {
    setLoadingBoardData(true);
    setError(null);
    try {
      const [cols, crds] = await Promise.all([
        chatKanbanService.listColumns(boardId),
        chatKanbanService.listCards(boardId, false),
      ]);
      setColumns(cols);
      setCards(crds);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar colunas';
      setError(msg);
      setColumns([]);
      setCards([]);
    } finally {
      setLoadingBoardData(false);
    }
  }, []);

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchFunnels();
      if (cancelled) return;
      if (res.success) {
        const mapped = ((res.data as Array<{ id: string; name: string }>) || []).map((f) => ({
          id: f.id,
          name: f.name,
        }));
        setFunnels(mapped);
      } else {
        setFunnels([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedBoardId) {
      setColumns([]);
      setCards([]);
      return;
    }
    void loadBoardDetail(selectedBoardId);
  }, [selectedBoardId, loadBoardDetail]);

  useEffect(() => {
    setAddCardColumnId(null);
  }, [selectedBoardId]);

  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => a.position - b.position),
    [columns],
  );

  const visibleSortedColumns = useMemo(
    () => sortedColumns.filter((c) => !parseKanbanColumnUi(c.metadata).hidden),
    [sortedColumns],
  );

  const cardMap = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const refreshCardsOnly = useCallback(async () => {
    if (!selectedBoardId) return;
    try {
      const crds = await chatKanbanService.listCards(selectedBoardId, false);
      setCards(crds);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao atualizar cartões');
    }
  }, [selectedBoardId]);

  useKanbanAttendanceSocketRefresh(
    session?.token,
    Boolean(selectedBoardId && !loadingBoardData),
    () => cards.map((c) => c.conversation_id),
    refreshCardsOnly,
  );

  const { pulseUnreadUntilByConversationId } = useKanbanBoardRealtimeCards(
    Boolean(selectedBoardId && !loadingBoardData),
    cards,
    setCards,
  );

  useEffect(() => {
    const onDragEndClear = () => setNativeDragHoverColumnId(null);
    window.addEventListener('painelcrm:conversation-drag-end', onDragEndClear);
    return () => window.removeEventListener('painelcrm:conversation-drag-end', onDragEndClear);
  }, []);

  const runAttachConversation = useCallback(
    async (
      columnId: string,
      conversationId: string,
      opts?: { move_reason?: string; move_confirmed?: boolean },
    ) => {
      if (!selectedBoardId) return;
      try {
        const updated = await chatKanbanService.attachConversation({
          board_id: selectedBoardId,
          column_id: columnId,
          conversation_id: conversationId,
          ...opts,
        });
        const auto = updated.kanban_auto_created_proposal;
        if (auto) {
          if (auto.public_link_path?.trim()) {
            const full = `${window.location.origin}${auto.public_link_path.trim()}`;
            setStoredProposalPublicUrl(auto.id, full);
          }
          toast.success('Proposta criada automaticamente', {
            description: auto.title,
            action: auto.public_link_path
              ? {
                  label: 'Abrir link',
                  onClick: () =>
                    window.open(
                      `${window.location.origin}${auto.public_link_path!.trim()}`,
                      '_blank',
                      'noopener,noreferrer',
                    ),
                }
              : undefined,
          });
        }
        await refreshCardsOnly();
      } catch (err: unknown) {
        const e = err as Error & { code?: string };
        if (e.code === 'KANBAN_MOVE_REASON_REQUIRED') {
          const col = columns.find((c) => c.id === columnId);
          setAttachMoveReason({
            colId: columnId,
            convId: conversationId,
            columnName: col?.name?.trim() || 'Coluna',
          });
          return;
        }
        if (e.code === 'KANBAN_MOVE_CONFIRMATION_REQUIRED') {
          const col = columns.find((c) => c.id === columnId);
          setAttachMoveConfirm({
            colId: columnId,
            convId: conversationId,
            columnName: col?.name?.trim() || 'Coluna',
          });
          return;
        }
        toast.error(e.message || 'Não foi possível anexar a conversa ao quadro');
      }
    },
    [selectedBoardId, cards, columns, refreshCardsOnly],
  );

  const handleNativeConversationDrop = useCallback(
    async (e: React.DragEvent, columnId: string) => {
      e.preventDefault();
      const payload =
        readConversationDragFromDataTransfer(e.dataTransfer) || getActiveConversationDrag();
      endConversationDragSession();
      setNativeDragHoverColumnId(null);
      if (!payload?.conversationId || !selectedBoardId) return;
      await runAttachConversation(columnId, payload.conversationId);
    },
    [selectedBoardId, runAttachConversation],
  );

  const buildNativeDropForColumn = useCallback(
    (columnId: string) => {
      if (!selectedBoardId || loadingBoardData || visibleSortedColumns.length === 0) return null;
      const session = getActiveConversationDrag();
      const convId = session?.conversationId;
      const onBoard = convId ? cards.some((c) => c.conversation_id === convId) : false;
      let hint = 'Soltar conversa nesta etapa';
      if (session) {
        if (onBoard) hint = 'Mover para esta etapa';
        else if (session.hasLead || session.hasClient) hint = 'Soltar para adicionar ao funil';
        else hint = 'Soltar conversa nesta etapa';
      }

      return {
        nativeConversationDragOver: nativeDragHoverColumnId === columnId,
        nativeDropTitle: nativeDragHoverColumnId === columnId ? hint : null,
        onNativeDragEnter: (ev: React.DragEvent) => {
          const allow =
            isNativeConversationDragActive() || dataTransferHasConversationDragMime(ev.dataTransfer);
          if (!allow) return;
          setNativeDragHoverColumnId(columnId);
        },
        onNativeDragOver: (ev: React.DragEvent) => {
          const allow =
            isNativeConversationDragActive() || dataTransferHasConversationDragMime(ev.dataTransfer);
          if (!allow) return;
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'copy';
          setNativeDragHoverColumnId(columnId);
        },
        onNativeDragLeave: (ev: React.DragEvent) => {
          if (!ev.currentTarget.contains(ev.relatedTarget as Node)) {
            setNativeDragHoverColumnId((prev) => (prev === columnId ? null : prev));
          }
        },
        onNativeDrop: (ev: React.DragEvent) => {
          void handleNativeConversationDrop(ev, columnId);
        },
      };
    },
    [
      selectedBoardId,
      loadingBoardData,
      visibleSortedColumns.length,
      nativeDragHoverColumnId,
      cards,
      handleNativeConversationDrop,
    ],
  );

  const openKanbanCardInFloating = useCallback(
    (card: ChatKanbanBoardCard) => {
      const id = card.conversation_id;
      if (floatingChat) {
        floatingChat.openConversationInContext(id);
      } else {
        window.dispatchEvent(
          new CustomEvent('painelcrm:floating-chat-open', {
            detail: { conversationId: id, source: 'kanban_card' },
          }),
        );
      }
    },
    [floatingChat],
  );

  const boardDnd = useChatKanbanBoardDnd({
    cards,
    setCards,
    sortedColumns: visibleSortedColumns,
    enabled: Boolean(selectedBoardId && visibleSortedColumns.length > 0 && !loadingBoardData),
    requestMoveReason,
    requestMoveConfirmation,
  });

  const dragOverlayColumnMetadata = useMemo(() => {
    if (!boardDnd.activeId) return null;
    const c = cardMap.get(boardDnd.activeId);
    if (!c) return null;
    const col = columns.find((x) => x.id === c.column_id);
    return col?.metadata ?? null;
  }, [boardDnd.activeId, cardMap, columns]);

  const settingsColumnLive = useMemo(() => {
    if (!settingsColumn) return null;
    return columns.find((c) => c.id === settingsColumn.id) ?? settingsColumn;
  }, [columns, settingsColumn]);

  const columnPositionLabel = useMemo(() => {
    if (!settingsColumnLive) return '';
    const idx = sortedColumns.findIndex((c) => c.id === settingsColumnLive.id);
    const ord = idx >= 0 ? idx + 1 : '—';
    return `Ordem no quadro: ${ord} de ${sortedColumns.length} (ajuste fino de posição pela API ou futuro reordenar no gestor).`;
  }, [settingsColumnLive, sortedColumns]);

  const cardCountByColumn = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of cards) {
      m[c.column_id] = (m[c.column_id] ?? 0) + 1;
    }
    return m;
  }, [cards]);

  const boardConversationIds = useMemo(() => cards.map((c) => c.conversation_id), [cards]);

  const addCardColumn = useMemo(() => {
    if (!addCardColumnId) return null;
    return columns.find((c) => c.id === addCardColumnId) ?? null;
  }, [addCardColumnId, columns]);

  const handleCreateBoard = async () => {
    const name = createName.trim();
    if (!name) {
      toast.error('Informe o nome do quadro');
      return;
    }
    setCreating(true);
    try {
      const created = await chatKanbanService.createBoard({
        name,
        linked_sales_funnel_id: createLinkedFunnelId === 'none' ? null : createLinkedFunnelId,
      });
      toast.success('Quadro criado');
      setCreateOpen(false);
      setCreateName('');
      setCreateLinkedFunnelId('none');
      await loadBoards();
      setSelectedBoardId(created.id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Falha ao criar quadro');
    } finally {
      setCreating(false);
    }
  };

  const selectedBoard = useMemo(
    () => boards.find((b) => b.id === selectedBoardId) ?? null,
    [boards, selectedBoardId],
  );

  const kanbanBoardScrollRef = useRef<HTMLDivElement>(null);
  const kanbanBoardInnerRef = useRef<HTMLDivElement>(null);
  const panStripState = useRef({ active: false, pointerId: 0, startX: 0, startScroll: 0 });
  const [boardHScroll, setBoardHScroll] = useState({ scrollWidth: 0, clientWidth: 0 });

  useLayoutEffect(() => {
    const main = kanbanBoardScrollRef.current;
    const inner = kanbanBoardInnerRef.current;
    if (!main || !inner) return;
    const update = () => {
      setBoardHScroll({
        scrollWidth: main.scrollWidth,
        clientWidth: main.clientWidth,
      });
    };
    const ro = new ResizeObserver(update);
    ro.observe(main);
    ro.observe(inner);
    update();
    return () => ro.disconnect();
  }, [selectedBoardId, loadingBoardData, visibleSortedColumns.length]);

  useEffect(() => {
    const el = kanbanBoardScrollRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        el.scrollLeft += e.deltaX;
        e.preventDefault();
      } else if (e.shiftKey) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, [selectedBoardId, loadingBoardData, visibleSortedColumns.length]);

  const boardHasHorizontalOverflow = boardHScroll.scrollWidth > boardHScroll.clientWidth + 2;

  const onPanStripPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const main = kanbanBoardScrollRef.current;
    if (!main || main.scrollWidth <= main.clientWidth) return;
    panStripState.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startScroll: main.scrollLeft,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPanStripPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!panStripState.current.active) return;
    const main = kanbanBoardScrollRef.current;
    if (!main) return;
    main.scrollLeft = panStripState.current.startScroll - (e.clientX - panStripState.current.startX);
  };

  const onPanStripPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!panStripState.current.active) return;
    panStripState.current.active = false;
    try {
      e.currentTarget.releasePointerCapture(panStripState.current.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 -m-6 p-6">
      <div className="flex shrink-0 flex-col gap-4">
        <ChatKanbanToolbar
          boards={boards}
          selectedBoardId={selectedBoardId}
          onBoardChange={(id) => setSelectedBoardId(id)}
          onCreateBoardClick={() => setCreateOpen(true)}
          onManageColumnsClick={() => setColumnManagerOpen(true)}
          manageColumnsDisabled={!selectedBoardId || loadingBoardData}
          disabledSelect={loadingBoards}
          onBoardSettingsClick={() => setBoardSettingsOpen(true)}
          showBoardSettings={Boolean(selectedBoard?.current_user_can_manage)}
          boardSettingsDisabled={!selectedBoardId || loadingBoardData}
        />

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Erro ao carregar</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm">{error}</span>
              <Button type="button" variant="outline" size="sm" className="shrink-0 gap-2" onClick={() => void loadBoards()}>
                <RefreshCw className="h-4 w-4" />
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      {loadingBoards ? (
        <div className="shrink-0 space-y-4">
          <Skeleton className="h-10 w-full max-w-3xl" />
          <div className="flex gap-3 overflow-hidden">
            <Skeleton className="h-[320px] w-[280px] flex-shrink-0 rounded-lg" />
            <Skeleton className="h-[320px] w-[280px] flex-shrink-0 rounded-lg" />
            <Skeleton className="h-[320px] w-[280px] flex-shrink-0 rounded-lg" />
          </div>
        </div>
      ) : boards.length === 0 ? (
        <ChatKanbanEmptyState
          icon={LayoutGrid}
          title="Nenhum quadro ainda"
          description="Crie o primeiro quadro Kanban para organizar conversas por etapas. As colunas podem ser adicionadas depois pela API ou numa próxima versão da interface."
          actionLabel="Criar quadro"
          onAction={() => setCreateOpen(true)}
        />
      ) : !selectedBoardId ? (
        <ChatKanbanEmptyState
          icon={PanelTop}
          title="Selecione um quadro"
          description="Escolha um quadro na lista acima para ver as colunas."
        />
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {loadingBoardData ? (
            <div className="flex shrink-0 items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              A carregar colunas…
            </div>
          ) : columns.length === 0 ? (
            <ChatKanbanEmptyState
              icon={PanelTop}
              title="Este quadro ainda não tem colunas"
              description="As colunas definem as etapas do Kanban (ex.: Novo lead, Qualificação, Fechamento). Crie a primeira para começar a adicionar conversas."
              actionLabel="Criar primeira coluna"
              onAction={() => setColumnManagerOpen(true)}
            />
          ) : visibleSortedColumns.length === 0 ? (
            <ChatKanbanEmptyState
              icon={PanelTop}
              title="Nenhuma coluna visível"
              description="Todas as colunas estão ocultas no quadro. Abra Gerenciar colunas e use Configurar numa coluna para desativar «Ocultar no quadro», ou crie uma coluna nova."
              actionLabel="Gerenciar colunas"
              onAction={() => setColumnManagerOpen(true)}
            />
          ) : (
            <DndContext
              sensors={boardDnd.sensors}
              collisionDetection={boardDnd.collisionDetection}
              onDragStart={boardDnd.onDragStart}
              onDragOver={boardDnd.onDragOver}
              onDragEnd={boardDnd.onDragEnd}
              onDragCancel={boardDnd.onDragCancel}
            >
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {boardHasHorizontalOverflow ? (
                  <div
                    className="mb-1.5 flex h-6 shrink-0 cursor-grab select-none items-center justify-center gap-1 rounded-md border border-border/40 bg-muted/20 px-2 text-[11px] leading-tight text-muted-foreground hover:bg-muted/35 active:cursor-grabbing"
                    onPointerDown={onPanStripPointerDown}
                    onPointerMove={onPanStripPointerMove}
                    onPointerUp={onPanStripPointerUp}
                    onPointerCancel={onPanStripPointerUp}
                    title="Clique e arraste para deslocar o quadro"
                  >
                    <GripHorizontal className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
                    Arraste para mover o quadro horizontalmente
                  </div>
                ) : null}
                <div
                  id="kanban-board-strip"
                  ref={kanbanBoardScrollRef}
                  className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-lg border border-border/50 bg-muted/20 px-1 pt-1 pb-2 shadow-inner scrollbar-thin"
                >
                  <div
                    ref={kanbanBoardInnerRef}
                    className="flex h-full min-h-[min(70dvh,560px)] w-max items-stretch gap-4 px-2 py-2"
                  >
                    {visibleSortedColumns.map((col) => (
                      <ChatKanbanBoardColumn
                        key={col.id}
                        column={col}
                        cardIds={boardDnd.dndItems[col.id] ?? []}
                        cardMap={cardMap}
                        onCardClick={openKanbanCardInFloating}
                        onAddCard={() => setAddCardColumnId(col.id)}
                        onConfigureColumn={(c) => setSettingsColumn(c)}
                        nativeDrop={buildNativeDropForColumn(col.id)}
                        pulseUnreadUntilByConversationId={pulseUnreadUntilByConversationId}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
                {(() => {
                  const dragCard = boardDnd.activeId ? cardMap.get(boardDnd.activeId) : undefined;
                  if (!dragCard) return null;
                  const pulseUnreadHighlight =
                    (pulseUnreadUntilByConversationId[dragCard.conversation_id] ?? 0) > Date.now();
                  return (
                    <div className="pointer-events-none w-[264px] max-w-[86vw] rotate-1 scale-[1.02] shadow-2xl opacity-95">
                      <ChatKanbanCard
                        card={dragCard}
                        columnMetadata={dragOverlayColumnMetadata}
                        onClick={() => {}}
                        pulseUnreadHighlight={pulseUnreadHighlight}
                      />
                    </div>
                  );
                })()}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      )}

      <ChatKanbanColumnManagerDialog
        open={columnManagerOpen}
        onOpenChange={setColumnManagerOpen}
        boardId={selectedBoardId}
        columns={columns}
        cardCountByColumn={cardCountByColumn}
        onChanged={() => {
          if (selectedBoardId) void loadBoardDetail(selectedBoardId);
        }}
        onConfigureColumn={(col) => setSettingsColumn(col)}
      />

      <ChatKanbanBoardSettingsSheet
        open={boardSettingsOpen}
        onOpenChange={setBoardSettingsOpen}
        boardId={boardSettingsOpen ? selectedBoardId : null}
        onSaved={() => {
          void loadBoards();
          if (selectedBoardId) void loadBoardDetail(selectedBoardId);
        }}
        onDeleted={() => {
          void loadBoards();
        }}
      />

      <ChatKanbanColumnSettingsSheet
        open={settingsColumn !== null}
        onOpenChange={(o) => {
          if (!o) setSettingsColumn(null);
        }}
        column={settingsColumnLive}
        positionLabel={columnPositionLabel}
        onSaved={() => {
          if (selectedBoardId) void loadBoardDetail(selectedBoardId);
        }}
      />

      <ChatKanbanAddCardDialog
        open={addCardColumnId !== null}
        onOpenChange={(o) => {
          if (!o) setAddCardColumnId(null);
        }}
        boardId={selectedBoardId}
        column={addCardColumn}
        excludedConversationIds={boardConversationIds}
        onCreated={() => void refreshCardsOnly()}
      />

      <ChatKanbanMoveReasonDialog
        open={moveReasonUi !== null}
        columnName={moveReasonUi?.columnName ?? ''}
        onCancel={() => finishMoveReason(null)}
        onConfirm={(r) => finishMoveReason(r)}
      />

      <ChatKanbanMoveConfirmDialog
        open={moveConfirmUi !== null}
        columnName={moveConfirmUi?.columnName ?? ''}
        onCancel={() => finishMoveConfirm(false)}
        onConfirm={() => finishMoveConfirm(true)}
      />

      <ChatKanbanMoveReasonDialog
        open={attachMoveReason !== null}
        columnName={attachMoveReason?.columnName ?? ''}
        onCancel={() => setAttachMoveReason(null)}
        onConfirm={(r) => {
          const ctx = attachMoveReason;
          setAttachMoveReason(null);
          if (ctx) void runAttachConversation(ctx.colId, ctx.convId, { move_reason: r });
        }}
      />

      <ChatKanbanMoveConfirmDialog
        open={attachMoveConfirm !== null}
        columnName={attachMoveConfirm?.columnName ?? ''}
        onCancel={() => setAttachMoveConfirm(null)}
        onConfirm={() => {
          const ctx = attachMoveConfirm;
          setAttachMoveConfirm(null);
          if (ctx) void runAttachConversation(ctx.colId, ctx.convId, { move_confirmed: true });
        }}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo quadro</DialogTitle>
            <DialogDescription>
              Nome do quadro Kanban. Depois poderá adicionar colunas e cartões nas próximas etapas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="kanban-new-board-name">Nome</Label>
            <Input
              id="kanban-new-board-name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Ex.: Comercial — WhatsApp"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateBoard();
              }}
            />
            <div className="space-y-1.5">
              <Label>Funil vinculado (opcional)</Label>
              <Select value={createLinkedFunnelId} onValueChange={setCreateLinkedFunnelId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Sem funil vinculado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem funil vinculado</SelectItem>
                  {funnels.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleCreateBoard()} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatKanbanPage;
