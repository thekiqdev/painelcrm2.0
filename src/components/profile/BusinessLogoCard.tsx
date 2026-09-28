import React, { useRef } from 'react';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Variant = 'light' | 'dark';

type Props = {
  lightUrl: string | null;
  darkUrl: string | null;
  uploadingLight: boolean;
  uploadingDark: boolean;
  onUpload: (file: File, variant: Variant) => void;
  onRemove: (variant: Variant) => void;
};

export function BusinessLogoCard({ lightUrl, darkUrl, uploadingLight, uploadingDark, onUpload, onRemove }: Props) {
  const lightRef = useRef<HTMLInputElement>(null);
  const darkRef = useRef<HTMLInputElement>(null);

  const block = (variant: Variant, url: string | null, uploading: boolean) => (
    <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card/50 p-4">
      <Label className="text-base font-medium">{variant === 'light' ? 'Logo para fundo claro' : 'Logo para fundo escuro'}</Label>
      <div
        className={cn(
          'flex min-h-[140px] items-center justify-center overflow-hidden rounded-xl border border-dashed border-border',
          variant === 'dark' ? 'bg-slate-950' : 'bg-muted/50',
        )}
      >
        {url ? (
          <img src={url} alt="" className="max-h-32 max-w-full object-contain p-3" />
        ) : (
          <span className="px-4 text-center text-sm text-muted-foreground">Nenhuma imagem</span>
        )}
      </div>
      <p className="text-xs leading-snug text-muted-foreground">Usado em áreas do sistema, relatórios e documentos.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          ref={variant === 'light' ? lightRef : darkRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onUpload(f, variant);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="h-12 flex-1 rounded-xl"
          disabled={uploading}
          onClick={() => (variant === 'light' ? lightRef : darkRef).current?.click()}
        >
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Enviar logo
        </Button>
        {url ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 rounded-xl sm:px-6"
            disabled={uploading}
            onClick={() => onRemove(variant)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remover
          </Button>
        ) : null}
      </div>
    </div>
  );

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Logos da empresa</CardTitle>
        <CardDescription className="text-sm">Variantes para tema claro e escuro em documentos e telas.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-1">
        {block('light', lightUrl, uploadingLight)}
        {block('dark', darkUrl, uploadingDark)}
      </CardContent>
    </Card>
  );
}
