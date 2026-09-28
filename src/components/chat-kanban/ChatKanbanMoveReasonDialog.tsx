import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  open: boolean;
  columnName: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

export function ChatKanbanMoveReasonDialog({ open, columnName, onCancel, onConfirm }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setText('');
  }, [open]);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      onConfirm(t);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Motivo da movimentação</DialogTitle>
          <DialogDescription>
            A coluna «{columnName}» exige um motivo ao receber o cartão. Descreva brevemente o motivo da mudança.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="kanban-move-reason">Motivo</Label>
          <Textarea
            id="kanban-move-reason"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex.: Cliente desistiu; acordo fechado; transferência interna…"
            rows={4}
            autoFocus
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={busy || !text.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar movimento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
