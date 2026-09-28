import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { ProjectVersion } from '@/services/projects';
import { PROJECT_VERSION_STATUS_LABELS } from '@/lib/projectVersionSelection';
import type { ProjectVersionStatus } from '@/lib/projectVersionSelection';

type ProjectVersionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version?: ProjectVersion | null;
  saving?: boolean;
  onSave: (payload: {
    name: string;
    description: string | null;
    status: ProjectVersionStatus;
    start_date: string | null;
    due_date: string | null;
    is_default?: boolean;
    frozen?: boolean;
  }) => Promise<void>;
  onArchive?: (version: ProjectVersion) => Promise<void>;
  onUnarchive?: (version: ProjectVersion) => Promise<void>;
};

export function ProjectVersionDialog({
  open,
  onOpenChange,
  version,
  saving = false,
  onSave,
  onArchive,
  onUnarchive,
}: ProjectVersionDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectVersionStatus>('planning');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(version?.name ?? '');
    setDescription(version?.description ?? '');
    setStatus(version?.status ?? 'planning');
    setStartDate(version?.start_date ?? '');
    setDueDate(version?.due_date ?? '');
    setIsDefault(Boolean(version?.is_default));
  }, [open, version]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await onSave({
      name: trimmed,
      description: description.trim() || null,
      status,
      start_date: startDate || null,
      due_date: dueDate || null,
      ...(version ? { is_default: isDefault } : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{version ? 'Editar versão' : 'Nova versão'}</DialogTitle>
          <DialogDescription>Organize entregas e backlog do projeto avançado.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="version-name">Nome</Label>
            <Input
              id="version-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: MVP, v1.1"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="version-description">Descrição</Label>
            <Textarea
              id="version-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROJECT_VERSION_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {version ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <Label>Versão padrão</Label>
                <Switch checked={isDefault} onCheckedChange={setIsDefault} />
              </div>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="version-start">Início</Label>
              <Input
                id="version-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="version-due">Prazo</Label>
              <Input
                id="version-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {version && version.archived_at && onUnarchive ? (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => void onUnarchive(version)}
              >
                Desarquivar
              </Button>
            ) : version && onArchive && !version.archived_at ? (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => void onArchive(version)}
              >
                Arquivar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'A guardar…' : 'Salvar'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
