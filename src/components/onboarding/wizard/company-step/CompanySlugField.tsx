import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { SlugCheckState } from '@/hooks/useOperationalSlugCheck';
import { Check, AlertTriangle, Loader2 } from 'lucide-react';

type Props = {
  slug: string;
  slugCheck: SlugCheckState;
  onSlugChange: (value: string) => void;
  onUseSuggestion: (suggestion: string) => void;
};

function SlugInputSuffix({ slugCheck }: { slugCheck: SlugCheckState }) {
  if (slugCheck.status === 'idle') return null;

  if (slugCheck.status === 'checking') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </span>
    );
  }

  if (slugCheck.status === 'available') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-400/90">
        <Check className="h-3.5 w-3.5" aria-hidden />
        disponível
      </span>
    );
  }

  if (slugCheck.status === 'invalid') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-amber-400/90">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        inválido
      </span>
    );
  }

  if (slugCheck.status === 'unavailable') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-amber-400/90">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        em uso
      </span>
    );
  }

  return null;
}

export function CompanySlugField({ slug, slugCheck, onSlugChange, onUseSuggestion }: Props) {
  const showUnavailable = slugCheck.status === 'unavailable';
  const hasSuffix = slugCheck.status !== 'idle';

  return (
    <div className="space-y-1.5">
      <Label htmlFor="company-slug" className="text-sm text-muted-foreground">
        Endereço da operação (slug)
      </Label>
      <div className="relative">
        <Input
          id="company-slug"
          value={slug}
          onChange={(e) => onSlugChange(e.target.value)}
          placeholder="minha-empresa"
          autoComplete="off"
          spellCheck={false}
          className={cn(
            'h-11 w-full border-white/10 bg-white/[0.03] font-mono text-base lg:h-12',
            hasSuffix && 'pr-[7.5rem]',
          )}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center"
          aria-live="polite"
        >
          <SlugInputSuffix slugCheck={slugCheck} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Este será o endereço único da sua operação dentro da plataforma.
      </p>

      {showUnavailable ? (
        <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5">
          <p className="text-xs text-muted-foreground">
            Sugestão:{' '}
            <span className="font-mono text-foreground/90">{slugCheck.suggestion}</span>
          </p>
          <button
            type="button"
            onClick={() => onUseSuggestion(slugCheck.suggestion)}
            className={cn(
              'text-xs font-semibold text-primary underline-offset-2 hover:underline',
            )}
          >
            Usar sugestão
          </button>
        </div>
      ) : null}
    </div>
  );
}
