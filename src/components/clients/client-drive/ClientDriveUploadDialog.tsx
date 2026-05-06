import React, { useRef } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileSelected: (file: File) => void;
  isUploading: boolean;
  maxMb: number;
  accept: string;
};

export function ClientDriveUploadDialog({
  open,
  onOpenChange,
  onFileSelected,
  isUploading,
  maxMb,
  accept,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar arquivo</DialogTitle>
          <DialogDescription>
            O ficheiro será enviado para a pasta em que se encontra. Limite de {maxMb} MB. Formatos permitidos: PDF,
            imagens, Word, Excel, texto, CSV e ZIP.
          </DialogDescription>
        </DialogHeader>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept}
          disabled={isUploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.currentTarget.value = '';
            if (f) onFileSelected(f);
          }}
        />
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading}>
            Fechar
          </Button>
          <Button
            type="button"
            className="gap-2"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="h-4 w-4" aria-hidden />
            )}
            Escolher arquivo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
