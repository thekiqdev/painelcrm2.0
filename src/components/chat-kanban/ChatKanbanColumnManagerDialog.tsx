import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Settings, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ChatKanbanColumn } from '@/services/chatKanban';
import { useKanbanService } from '@/components/chat-kanban/KanbanServiceContext';
import { KANBAN_COLUMN_COLOR_PRESETS } from '@/components/chat-kanban/kanbanColumnPresets';
import { parseKanbanColumnUi } from '@/utils/kanbanColumnRulesUi';

function ColorPresetPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {KANBAN_COLUMN_COLOR_PRESETS.map((p) => {
        const selected = (p.value ?? null) === (value ?? null);
        return (
          <button
            key={p.label}
            type="button"
            disabled={disabled}
            title={p.label}
            onClick={() => onChange(p.value)}
            className={cn(
              'h-8 w-8 rounded-full border-2 transition-all shrink-0',
              p.swatch,
              selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-105' : 'opacity-90 hover:opacity-100',
              disabled && 'pointer-events-none opacity-50',
            )}
          />
        );
      })}
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string | null;
  columns: ChatKanbanColumn[];
  cardCountByColumn: Record<string, number>;
  onChanged: () => void;
  onConfigureColumn: (column: ChatKanbanColumn) => void;
};

export function ChatKanbanColumnManagerDialog({
  open,
  onOpenChange,
  boardId,
  columns,
  cardCountByColumn,
  onChanged,
  onConfigureColumn,
}: Props) {
  const kanban = useKanbanService();
  const sorted = useMemo(
    () => [...columns].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [columns],
  );

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<ChatKanbanColumn | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) {
      setNewName('');
      setNewColor(null);
      setPendingDelete(null);
    }
  }, [open]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!boardId || !name) {
      toast.error('Informe o nome da coluna');
      return;
    }
    setCreating(true);
    try {
      await kanban.createColumn(boardId, {
        name,
        color: newColor,
      });
      toast.success('Coluna criada');
      setNewName('');
      setNewColor(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao criar coluna');
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await kanban.deleteColumn(pendingDelete.id);
      toast.success('Coluna excluída');
      setPendingDelete(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível excluir');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Gerenciar colunas</DialogTitle>
            <DialogDescription>
              Crie colunas de forma rápida. Para regras, automações e detalhes, abra a configuração pelo cabeçalho da
              coluna no quadro.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1 shrink-0">
            <div className="space-y-2">
              <Label htmlFor="kanban-new-col-name">Nova coluna</Label>
              <Input
                id="kanban-new-col-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex.: Novo lead"
                disabled={!boardId}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Cor do cabeçalho (opcional)</span>
              <ColorPresetPicker value={newColor} onChange={setNewColor} disabled={!boardId || creating} />
            </div>
            <Button
              type="button"
              className="w-full gap-2"
              onClick={() => void handleCreate()}
              disabled={!boardId || creating || !newName.trim()}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar coluna
            </Button>
          </div>

          <Separator />

          <div className="min-h-0 flex-1 flex flex-col gap-2">
            <span className="text-sm font-medium">Colunas ({sorted.length})</span>
            <ScrollArea className="h-[min(280px,40vh)] rounded-md border border-border/60 pr-2 [&_[data-radix-scroll-area-viewport]]:!block">
              <ul className="p-2 space-y-2">
                {sorted.length === 0 ? (
                  <li className="text-sm text-muted-foreground text-center py-8">Nenhuma coluna ainda.</li>
                ) : (
                  sorted.map((col) => {
                    const count = cardCountByColumn[col.id] ?? 0;
                    const hidden = parseKanbanColumnUi(col.metadata).hidden;
                    return (
                      <li
                        key={col.id}
                        className="rounded-lg border border-border/60 bg-muted/20 p-3 flex items-start gap-2"
                      >
                        <div
                          className={cn(
                            'h-9 w-1 rounded-full shrink-0 mt-0.5',
                            col.color?.startsWith('bg-') ? col.color : 'bg-muted-foreground/30',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm truncate">{col.name}</p>
                            {hidden ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal shrink-0">
                                Oculta
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {count === 0 ? 'Sem cartões' : `${count} cartão(ões)`}
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Configurar coluna"
                            onClick={() => {
                              onConfigureColumn(col);
                              onOpenChange(false);
                            }}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title={count > 0 ? 'Remova os cartões antes de excluir' : 'Excluir coluna'}
                            disabled={count > 0}
                            onClick={() => setPendingDelete(col)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir coluna?</AlertDialogTitle>
            <AlertDialogDescription>
              A coluna «{pendingDelete?.name}» será removida permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
