import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { LayoutGrid, Loader2, PanelTop, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { ChatKanbanConversationDrawer } from '@/components/chat-kanban/ChatKanbanConversationDrawer';
import { ChatKanbanEmptyState } from '@/components/chat-kanban/ChatKanbanEmptyState';
import { ChatKanbanMoveReasonDialog } from '@/components/chat-kanban/ChatKanbanMoveReasonDialog';
import { ChatKanbanMoveConfirmDialog } from '@/components/chat-kanban/ChatKanbanMoveConfirmDialog';
import { ChatKanbanColumnSettingsSheet } from '@/components/chat-kanban/ChatKanbanColumnSettingsSheet';
import {
  chatKanbanService,
  type ChatKanbanBoard,
  type ChatKanbanBoardCard,
  type ChatKanbanColumn,
} from '@/services/chatKanban';
import { parseKanbanColumnUi } from '@/utils/kanbanColumnRulesUi';
import { useAuth } from '@/contexts/AuthContext';
import { useKanbanAttendanceSocketRefresh } from '@/hooks/useKanbanAttendanceSocketRefresh';

const ChatKanbanPage = () => {
  const { session } = useAuth();
  const [boards, setBoards] = useState<ChatKanbanBoard[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [columns, setColumns] = useState<ChatKanbanColumn[]>([]);
  const [cards, setCards] = useState<ChatKanbanBoardCard[]>([]);
  const [drawerCard, setDrawerCard] = useState<ChatKanbanBoardCard | null>(null);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingBoardData, setLoadingBoardData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [columnManagerOpen, setColumnManagerOpen] = useState(false);
  const [addCardColumnId, setAddCardColumnId] = useState<string | null>(null);
  const [settingsColumn, setSettingsColumn] = useState<ChatKanbanColumn | null>(null);

  const moveReasonWaiterRef = useRef<{ resolve: (v: string | null) => void } | null>(null);
  const [moveReasonUi, setMoveReasonUi] = useState<{ columnName: string } | null>(null);

  const moveConfirmWaiterRef = useRef<{ resolve: (v: boolean) => void } | null>(null);
  const [moveConfirmUi, setMoveConfirmUi] = useState<{ columnName: string } | null>(null);

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

  const handleCardSynced = useCallback((u: ChatKanbanBoardCard) => {
    setDrawerCard((d) => (d && d.id === u.id ? { ...d, ...u } : d));
  }, []);

  const boardDnd = useChatKanbanBoardDnd({
    cards,
    setCards,
    sortedColumns: visibleSortedColumns,
    enabled: Boolean(selectedBoardId && visibleSortedColumns.length > 0 && !loadingBoardData),
    requestMoveReason,
    requestMoveConfirmation,
    onCardSynced: handleCardSynced,
  });

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
      const created = await chatKanbanService.createBoard({ name });
      toast.success('Quadro criado');
      setCreateOpen(false);
      setCreateName('');
      await loadBoards();
      setSelectedBoardId(created.id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Falha ao criar quadro');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 -m-6 p-6 min-h-0">
      <ChatKanbanToolbar
        boards={boards}
        selectedBoardId={selectedBoardId}
        onBoardChange={(id) => setSelectedBoardId(id)}
        onCreateBoardClick={() => setCreateOpen(true)}
        onManageColumnsClick={() => setColumnManagerOpen(true)}
        manageColumnsDisabled={!selectedBoardId || loadingBoardData}
        disabledSelect={loadingBoards}
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

      {loadingBoards ? (
        <div className="space-y-4">
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
        <div className="flex flex-col gap-3 min-h-0 flex-1">
          {loadingBoardData ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
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
              <div className="flex gap-4 overflow-x-auto pb-4 pt-1 scrollbar-thin">
                {visibleSortedColumns.map((col) => (
                  <ChatKanbanBoardColumn
                    key={col.id}
                    column={col}
                    cardIds={boardDnd.dndItems[col.id] ?? []}
                    cardMap={cardMap}
                    onCardClick={(c) => setDrawerCard(c)}
                    onAddCard={() => setAddCardColumnId(col.id)}
                    onConfigureColumn={(c) => setSettingsColumn(c)}
                  />
                ))}
              </div>
              <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
                {boardDnd.activeId && cardMap.get(boardDnd.activeId) ? (
                  <div className="pointer-events-none w-[264px] max-w-[86vw] rotate-1 scale-[1.02] shadow-2xl opacity-95">
                    <ChatKanbanCard card={cardMap.get(boardDnd.activeId)!} onClick={() => {}} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      )}

      <ChatKanbanConversationDrawer
        open={drawerCard !== null}
        onOpenChange={(o) => {
          if (!o) setDrawerCard(null);
        }}
        card={drawerCard}
        onAfterSend={() => {
          if (selectedBoardId) void loadBoardDetail(selectedBoardId);
        }}
      />

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
