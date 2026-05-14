import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ProjectVersion } from '@/services/projects';

type ProjectDuplicateVersionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: ProjectVersion | null;
  saving?: boolean;
  onDuplicate: (payload: {
    name: string;
    copy_open_tasks: boolean;
    copy_completed_tasks: boolean;
    copy_checklists: boolean;
  }) => Promise<void>;
};

export function ProjectDuplicateVersionDialog({
  open,
  onOpenChange,
  version,
  saving = false,
  onDuplicate,
}: ProjectDuplicateVersionDialogProps) {
  const [name, setName] = useState('');
  const [copyOpenTasks, setCopyOpenTasks] = useState(true);
  const [copyCompletedTasks, setCopyCompletedTasks] = useState(false);
  const [copyChecklists, setCopyChecklists] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(version ? `${version.name} cópia` : '');
    setCopyOpenTasks(true);
    setCopyCompletedTasks(false);
    setCopyChecklists(true);
  }, [open, version]);

  if (!version) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await onDuplicate({
      name: trimmed,
      copy_open_tasks: copyOpenTasks,
      copy_completed_tasks: copyCompletedTasks,
      copy_checklists: copyChecklists,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Duplicar versão</DialogTitle>
          <DialogDescription>Crie uma nova versão reaproveitando tarefas da versão atual.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="duplicate-version-name">Nome da nova versão</Label>
            <Input
              id="duplicate-version-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: v1.1"
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="copy-open-tasks"
                checked={copyOpenTasks}
                onCheckedChange={(checked) => setCopyOpenTasks(Boolean(checked))}
              />
              <Label htmlFor="copy-open-tasks">Copiar tarefas abertas</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="copy-completed-tasks"
                checked={copyCompletedTasks}
                onCheckedChange={(checked) => setCopyCompletedTasks(Boolean(checked))}
              />
              <Label htmlFor="copy-completed-tasks">Copiar tarefas concluídas</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="copy-checklists"
                checked={copyChecklists}
                onCheckedChange={(checked) => setCopyChecklists(Boolean(checked))}
              />
              <Label htmlFor="copy-checklists">Copiar checklists</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'A duplicar…' : 'Duplicar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
