import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<void>;
};

export function ClientDriveCreateFolderDialog({ open, onOpenChange, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) setName('');
  }, [open]);

  const handleCreate = async () => {
    const t = name.trim();
    if (!t || pending) return;
    setPending(true);
    try {
      await onSubmit(t);
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova pasta</DialogTitle>
          <DialogDescription>
            A pasta será criada dentro da localização atual e sincronizada com o Google Drive.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="client-drive-folder-name">Nome</Label>
          <Input
            id="client-drive-folder-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Documentos 2026"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleCreate()} disabled={pending || !name.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Criar pasta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
