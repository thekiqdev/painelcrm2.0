import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { chatKanbanService } from '@/services/chatKanban';
import { chatService } from '@/services/chat';
import { teamsService } from '@/services/teams';
import { getMyTenantUsers } from '@/services/tenantLimits';

export type FlowSelectOption = { value: string; label: string };

export type FlowKanbanColumnMeta = {
  boardId: string;
  boardName: string;
  columnId: string;
  columnName: string;
};

export function useFlowCrmOptions(enabled: boolean) {
  const usersQ = useQuery({
    queryKey: ['chatbot-flows', 'crm-options', 'users'],
    queryFn: getMyTenantUsers,
    enabled,
    staleTime: 60_000,
  });

  const teamsQ = useQuery({
    queryKey: ['chatbot-flows', 'crm-options', 'teams'],
    queryFn: () => teamsService.getTeams(),
    enabled,
    staleTime: 60_000,
  });

  const queuesQ = useQuery({
    queryKey: ['chatbot-flows', 'crm-options', 'queues'],
    queryFn: async () => {
      const res = await chatService.listQueues();
      return res.items ?? [];
    },
    enabled,
    staleTime: 60_000,
  });

  const tagsQ = useQuery({
    queryKey: ['chatbot-flows', 'crm-options', 'tags'],
    queryFn: () => chatKanbanService.listTenantKanbanTags(),
    enabled,
    staleTime: 60_000,
  });

  const boardsQ = useQuery({
    queryKey: ['chatbot-flows', 'crm-options', 'boards'],
    queryFn: () => chatKanbanService.listBoards(false),
    enabled,
    staleTime: 60_000,
  });

  const boards = boardsQ.data ?? [];

  const columnsQ = useQuery({
    queryKey: ['chatbot-flows', 'crm-options', 'columns', boards.map((b) => b.id).join(',')],
    queryFn: async () => {
      const pairs: FlowKanbanColumnMeta[] = [];
      for (const board of boards) {
        const cols = await chatKanbanService.listColumns(board.id);
        for (const col of cols) {
          pairs.push({
            boardId: board.id,
            boardName: board.name,
            columnId: col.id,
            columnName: col.name,
          });
        }
      }
      return pairs;
    },
    enabled: enabled && boards.length > 0,
    staleTime: 60_000,
  });

  const agentOptions: FlowSelectOption[] = (usersQ.data ?? []).map((u) => ({
    value: u.id,
    label: (u.full_name || u.email || u.id).trim(),
  }));

  const teamOptions: FlowSelectOption[] = (teamsQ.data ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }));

  const queueOptions: FlowSelectOption[] = (queuesQ.data ?? [])
    .filter((q) => q.is_active !== false)
    .map((q) => ({
      value: q.id,
      label: q.name,
    }));

  const tagOptions: FlowSelectOption[] = (tagsQ.data ?? []).map((t) => ({
    value: t.id,
    label: t.label,
  }));

  const boardOptions: FlowSelectOption[] = boards.map((b) => ({
    value: b.id,
    label: b.name,
  }));

  const kanbanColumns = columnsQ.data ?? [];

  const columnsByBoardId = useMemo(() => {
    const map: Record<string, FlowSelectOption[]> = {};
    for (const c of kanbanColumns) {
      if (!map[c.boardId]) map[c.boardId] = [];
      map[c.boardId].push({ value: c.columnId, label: c.columnName });
    }
    return map;
  }, [kanbanColumns]);

  /** Flat list (compat / inferência board a partir de column_id). */
  const columnOptions: FlowSelectOption[] = kanbanColumns.map((c) => ({
    value: c.columnId,
    label: `${c.boardName} → ${c.columnName}`,
  }));

  return {
    loading:
      usersQ.isLoading ||
      teamsQ.isLoading ||
      queuesQ.isLoading ||
      tagsQ.isLoading ||
      boardsQ.isLoading ||
      columnsQ.isLoading,
    agentOptions,
    teamOptions,
    queueOptions,
    tagOptions,
    boardOptions,
    columnsByBoardId,
    kanbanColumns,
    columnOptions,
  };
}
