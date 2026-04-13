import { LayoutGrid, LayoutList, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ChatKanbanBoard } from '@/services/chatKanban';

type Props = {
  boards: ChatKanbanBoard[];
  selectedBoardId: string | null;
  onBoardChange: (boardId: string) => void;
  onCreateBoardClick: () => void;
  /** Quadro selecionado: gestão de colunas do board atual */
  onManageColumnsClick?: () => void;
  manageColumnsDisabled?: boolean;
  disabledSelect?: boolean;
};

export function ChatKanbanToolbar({
  boards,
  selectedBoardId,
  onBoardChange,
  onCreateBoardClick,
  onManageColumnsClick,
  manageColumnsDisabled,
  disabledSelect,
}: Props) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground">
          <LayoutGrid className="h-5 w-5" aria-hidden />
          <span className="text-xs font-medium uppercase tracking-wide">Atendimento</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Kanban de conversas</h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          Organize conversas do WhatsApp em colunas. Visão operacional separada do chat clássico.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="w-full sm:w-[260px]">
          <label className="sr-only" htmlFor="kanban-board-select">
            Quadro ativo
          </label>
          <Select
            value={selectedBoardId ?? undefined}
            onValueChange={onBoardChange}
            disabled={disabledSelect || boards.length === 0}
          >
            <SelectTrigger id="kanban-board-select" className="w-full">
              <SelectValue placeholder={boards.length === 0 ? 'Nenhum quadro' : 'Escolher quadro'} />
            </SelectTrigger>
            <SelectContent>
              {boards.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {onManageColumnsClick ? (
          <Button
            type="button"
            variant="outline"
            onClick={onManageColumnsClick}
            disabled={manageColumnsDisabled}
            className="shrink-0 gap-2"
          >
            <LayoutList className="h-4 w-4" />
            Gerenciar colunas
          </Button>
        ) : null}
        <Button type="button" onClick={onCreateBoardClick} className="shrink-0 gap-2">
          <Plus className="h-4 w-4" />
          Novo quadro
        </Button>
      </div>
    </div>
  );
}
