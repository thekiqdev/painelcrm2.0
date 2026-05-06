import React, { useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export type MoveDestinationOption = { id: string; label: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  options: MoveDestinationOption[];
  onConfirm: (destinationFolderId: string) => Promise<void>;
};

export function ClientDriveMoveDialog({ open, onOpenChange, fileName, options, onConfirm }: Props) {
  const [choice, setChoice] = useState<string>('');
  const [pending, setPending] = useState(false);

  React.useEffect(() => {
    if (open && options.length > 0) {
      setChoice(options[0]!.id);
    } else if (!open) {
      setChoice('');
    }
  }, [open, options]);

  const handleMove = async () => {
    if (!choice || pending) return;
    setPending(true);
    try {
      await onConfirm(choice);
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mover arquivo</DialogTitle>
          <DialogDescription>
            Escolha a pasta de destino para <span className="font-medium text-foreground">{fileName}</span>.
          </DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Não há outras pastas disponíveis aqui. Crie uma subpasta ou volte atrás no caminho para mover.
          </p>
        ) : (
          <div className="max-h-[280px] overflow-y-auto py-2">
            <Label className="sr-only">Pasta de destino</Label>
            <RadioGroup value={choice} onValueChange={setChoice} className="gap-2">
              {options.map((o, idx) => (
                <div
                  key={o.id}
                  className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5"
                >
                  <RadioGroupItem value={o.id} id={`move-opt-${idx}`} />
                  <Label htmlFor={`move-opt-${idx}`} className="flex-1 cursor-pointer text-sm font-normal">
                    {o.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleMove()} disabled={pending || options.length === 0 || !choice}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
