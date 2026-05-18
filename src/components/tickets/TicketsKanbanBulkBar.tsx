import { useState } from 'react';
import { CheckCircle2, Tag, UserPlus, X } from 'lucide-react';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Member } from '@/services/members';

type BulkDialog = 'assign' | 'tag' | null;

export function TicketsKanbanBulkBar({
  selectedCount,
  members,
  currentUserId,
  onClear,
  onResolve,
  onAssign,
  onAddTag,
  busy,
}: {
  selectedCount: number;
  members: Member[];
  currentUserId?: string;
  onClear: () => void;
  onResolve: () => void;
  onAssign: (assigneeId: string) => void;
  onAddTag: (tag: string) => void;
  busy?: boolean;
}) {
  const [dialog, setDialog] = useState<BulkDialog>(null);
  const [assigneeId, setAssigneeId] = useState(currentUserId ?? '');
  const [tagInput, setTagInput] = useState('');

  if (selectedCount === 0) return null;

  return (
    <>
      <div className="sticky bottom-4 z-20 mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 rounded-xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <span className="text-sm font-medium">
          {selectedCount} selecionado{selectedCount !== 1 ? 's' : ''}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onResolve}>
            <CheckCircle2 className="h-4 w-4 mr-1" aria-hidden />
            Resolver
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setDialog('assign')}>
            <UserPlus className="h-4 w-4 mr-1" aria-hidden />
            Atribuir
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setDialog('tag')}>
            <Tag className="h-4 w-4 mr-1" aria-hidden />
            Tag
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClear} aria-label="Limpar seleção">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={dialog === 'assign'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atribuir tickets</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Responsável</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name || m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!assigneeId || busy}
              onClick={() => {
                onAssign(assigneeId);
                setDialog(null);
              }}
            >
              Atribuir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'tag'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bulk-tag">Tag</Label>
            <Input
              id="bulk-tag"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="ex.: follow-up"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  onAddTag(tagInput.trim());
                  setTagInput('');
                  setDialog(null);
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!tagInput.trim() || busy}
              onClick={() => {
                onAddTag(tagInput.trim());
                setTagInput('');
                setDialog(null);
              }}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
