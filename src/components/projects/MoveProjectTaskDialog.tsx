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
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ProjectArea, ProjectList, ProjectVersion } from '@/services/projects';

const TASK_PANEL_DIALOG_Z = '!z-[10001]';
const TASK_PANEL_DIALOG_OVERLAY_Z = '!z-[10000]';
const TASK_PANEL_DIALOG_DROPDOWN_Z = '!z-[10002]';

type MoveProjectTaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: ProjectVersion[];
  areas: ProjectArea[];
  lists: ProjectList[];
  currentListId: string;
  currentAreaId?: string | null;
  currentVersionId?: string | null;
  saving?: boolean;
  onMove: (payload: {
    list_id: string;
    version_id: string;
    area_id: string | null;
  }) => Promise<void>;
};

export function MoveProjectTaskDialog({
  open,
  onOpenChange,
  versions,
  areas,
  lists,
  currentListId,
  currentAreaId,
  currentVersionId,
  saving = false,
  onMove,
}: MoveProjectTaskDialogProps) {
  const activeVersions = useMemo(
    () => versions.filter((version) => !version.archived_at),
    [versions],
  );
  const initialVersionId =
    currentVersionId && activeVersions.some((version) => version.id === currentVersionId)
      ? currentVersionId
      : activeVersions[0]?.id ?? '';

  const [versionId, setVersionId] = useState(initialVersionId);
  const [listId, setListId] = useState(currentListId);
  const [areaId, setAreaId] = useState(currentAreaId ?? '');
  const [keepCurrentArea, setKeepCurrentArea] = useState(true);
  const [keepCurrentList, setKeepCurrentList] = useState(true);

  useEffect(() => {
    if (!open) return;
    setVersionId(initialVersionId);
    setListId(currentListId);
    setAreaId(currentAreaId ?? '');
    setKeepCurrentArea(true);
    setKeepCurrentList(true);
  }, [open, currentListId, currentAreaId, initialVersionId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!versionId) return;
    await onMove({
      list_id: keepCurrentList ? currentListId : listId,
      version_id: versionId,
      area_id: keepCurrentArea ? (currentAreaId ?? null) : (areaId || null),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('max-w-lg', TASK_PANEL_DIALOG_Z)}
        overlayClassName={TASK_PANEL_DIALOG_OVERLAY_Z}
      >
        <DialogHeader>
          <DialogTitle>Transferir para versão</DialogTitle>
          <DialogDescription>
            A tarefa sai da versão atual e passa a aparecer na versão de destino.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label>Versão destino</Label>
            <Select value={versionId} onValueChange={setVersionId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a versão" />
              </SelectTrigger>
              <SelectContent className={TASK_PANEL_DIALOG_DROPDOWN_Z}>
                {activeVersions.map((version) => (
                  <SelectItem key={version.id} value={version.id}>
                    {version.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {areas.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="keep-area"
                  checked={keepCurrentArea}
                  onCheckedChange={(checked) => setKeepCurrentArea(Boolean(checked))}
                />
                <Label htmlFor="keep-area">Manter área atual</Label>
              </div>
              {!keepCurrentArea ? (
                <Select value={areaId} onValueChange={setAreaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Área destino" />
                  </SelectTrigger>
                  <SelectContent className={TASK_PANEL_DIALOG_DROPDOWN_Z}>
                    {areas.map((area) => (
                      <SelectItem key={area.id} value={area.id}>
                        {area.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="keep-list"
                checked={keepCurrentList}
                onCheckedChange={(checked) => setKeepCurrentList(Boolean(checked))}
              />
              <Label htmlFor="keep-list">Manter lista atual</Label>
            </div>
            {!keepCurrentList ? (
              <Select value={listId} onValueChange={setListId}>
                <SelectTrigger>
                  <SelectValue placeholder="Lista destino" />
                </SelectTrigger>
                <SelectContent className={TASK_PANEL_DIALOG_DROPDOWN_Z}>
                  {lists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !versionId}>
              {saving ? 'A transferir…' : 'Transferir'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
