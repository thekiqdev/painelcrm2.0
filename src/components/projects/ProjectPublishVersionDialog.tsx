import { useEffect, useMemo, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ProjectVersion } from '@/services/projects';

type ProjectPublishVersionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: ProjectVersion | null;
  versions: ProjectVersion[];
  saving?: boolean;
  onPublish: (payload: {
    move_incomplete_to_version_id?: string | null;
    archive_after_publish: boolean;
    freeze_version: boolean;
    generate_release_notes: boolean;
  }) => Promise<void>;
};

const KEEP_VALUE = '__keep__';

export function ProjectPublishVersionDialog({
  open,
  onOpenChange,
  version,
  versions,
  saving = false,
  onPublish,
}: ProjectPublishVersionDialogProps) {
  const targets = useMemo(
    () => versions.filter((item) => !item.archived_at && item.id !== version?.id && !item.frozen),
    [versions, version?.id],
  );
  const [targetVersionId, setTargetVersionId] = useState(KEEP_VALUE);
  const [archiveAfterPublish, setArchiveAfterPublish] = useState(false);
  const [freezeVersion, setFreezeVersion] = useState(true);
  const [generateReleaseNotes, setGenerateReleaseNotes] = useState(true);

  useEffect(() => {
    if (!open) return;
    setTargetVersionId(targets[0]?.id ?? KEEP_VALUE);
    setArchiveAfterPublish(false);
    setFreezeVersion(true);
    setGenerateReleaseNotes(true);
  }, [open, targets]);

  if (!version) return null;

  const openTasks = version.metrics?.open_tasks ?? 0;
  const completedTasks = version.metrics?.completed_tasks ?? 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onPublish({
      move_incomplete_to_version_id: targetVersionId === KEEP_VALUE ? null : targetVersionId,
      archive_after_publish: archiveAfterPublish,
      freeze_version: freezeVersion,
      generate_release_notes: generateReleaseNotes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Publicar versão</DialogTitle>
          <DialogDescription>
            Finalize a release, gere o changelog e defina o destino das pendências.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="rounded-md border border-border p-3 text-sm">
            <p className="font-medium">{version.name}</p>
            <p className="mt-1 text-muted-foreground">
              {completedTasks} concluída(s) permanecem nesta release.
              {openTasks > 0 ? ` ${openTasks} pendência(s) podem ser movidas.` : ' Sem pendências abertas.'}
            </p>
          </div>
          {openTasks > 0 ? (
            <div className="space-y-2">
              <Label>Mover pendências para</Label>
              <Select value={targetVersionId} onValueChange={setTargetVersionId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP_VALUE}>Não mover agora</SelectItem>
                  {targets.map((target) => (
                    <SelectItem key={target.id} value={target.id}>
                      {target.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="publish-freeze"
                checked={freezeVersion}
                onCheckedChange={(checked) => setFreezeVersion(Boolean(checked))}
              />
              <Label htmlFor="publish-freeze">Congelar versão após publicar</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="publish-archive"
                checked={archiveAfterPublish}
                onCheckedChange={(checked) => setArchiveAfterPublish(Boolean(checked))}
              />
              <Label htmlFor="publish-archive">Arquivar após publicar</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="publish-notes"
                checked={generateReleaseNotes}
                onCheckedChange={(checked) => setGenerateReleaseNotes(Boolean(checked))}
              />
              <Label htmlFor="publish-notes">Gerar changelog automaticamente</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'A publicar…' : 'Publicar versão'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
