import React, { useRef } from 'react';
import { Camera, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatCpfCnpjDigits } from '@/lib/brazilInputMasks';
import { cn } from '@/lib/utils';

type Props = {
  displayName: string;
  legalName: string;
  cnpj: string;
  logoUrl: string | null;
  tenantStatus: string | null | undefined;
  editing: boolean;
  uploadingLogo: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onLogoFile: (file: File) => void;
};

function tenantStatusBadge(status: string | null | undefined) {
  const s = (status || 'active').toLowerCase();
  if (s === 'active') {
    return (
      <Badge className="border-emerald-500/30 bg-emerald-500/15 font-medium text-emerald-800 dark:text-emerald-200">
        Empresa ativa
      </Badge>
    );
  }
  if (s === 'trial') {
    return <Badge variant="secondary">Período de teste</Badge>;
  }
  return <Badge variant="outline">{status || 'Conta'}</Badge>;
}

export function BusinessProfileHero({
  displayName,
  legalName,
  cnpj,
  logoUrl,
  tenantStatus,
  editing,
  uploadingLogo,
  onStartEdit,
  onCancelEdit,
  onLogoFile,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initials = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'E';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-slate-500/[0.06] via-background to-muted/40 p-6 shadow-sm',
        'md:p-8',
      )}
    >
      <div className="pointer-events-none absolute -left-12 top-0 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />
      <div
        className={cn(
          'relative flex flex-col items-center gap-6',
          'md:flex-row md:items-start md:gap-8',
          'lg:flex-col lg:items-center lg:gap-5 lg:py-1',
        )}
      >
        <div className="relative shrink-0">
          <Avatar className="h-24 w-24 border-[3px] border-background shadow-md ring-2 ring-border/80 md:h-28 md:w-28 lg:h-32 lg:w-32">
            {logoUrl ? <AvatarImage src={logoUrl} alt="" className="object-contain p-1" /> : null}
            <AvatarFallback className="bg-muted text-lg font-semibold text-muted-foreground">{initials}</AvatarFallback>
          </Avatar>
          <button
            type="button"
            disabled={uploadingLogo}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-md transition hover:bg-primary/90',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
            aria-label="Trocar logo"
          >
            {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onLogoFile(f);
            }}
          />
        </div>

        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col items-center text-center',
            'md:items-start md:text-left',
            'lg:items-center lg:text-center',
          )}
        >
          <div
            className={cn('mb-2 flex flex-wrap items-center justify-center gap-2', 'md:justify-start', 'lg:justify-center')}
          >
            {tenantStatusBadge(tenantStatus)}
          </div>
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{displayName.trim() || 'Sua empresa'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground/80">Razão social: </span>
            {legalName.trim() || '—'}
          </p>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            CNPJ {formatCpfCnpjDigits(cnpj) || '—'}
          </p>

          <div
            className={cn(
              'mt-5 flex w-full max-w-md flex-col gap-2',
              'sm:flex-row md:max-w-none',
              'lg:max-w-full lg:grid lg:grid-cols-2 lg:gap-2',
            )}
          >
            {!editing ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 w-full rounded-xl sm:w-auto lg:col-span-1 lg:w-full"
                  disabled={uploadingLogo}
                  onClick={() => inputRef.current?.click()}
                >
                  {uploadingLogo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                  Trocar logo
                </Button>
                <Button type="button" className="h-11 w-full rounded-xl sm:w-auto lg:w-full" onClick={onStartEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar dados
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-xl sm:w-auto lg:col-span-2 lg:w-full"
                onClick={onCancelEdit}
              >
                Cancelar edição
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
