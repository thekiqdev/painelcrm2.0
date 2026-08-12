import { useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { useTenantBrand } from '@/contexts/TenantBrandContext';
import { useLogoPresentation } from '@/hooks/useLogoPresentation';
import { cn } from '@/lib/utils';

type TenantSidebarMarkProps = {
  collapsed: boolean;
  /** Ajusta margens/padding quando a marca fica no cabeçalho ao lado do trigger (ex.: `!mb-0 min-w-0 flex-1 px-0`). */
  className?: string;
};

/**
 * Bloco superior da sidebar:
 * - logo horizontal (wordmark) → só a imagem
 * - logo ~1:1 (ícone) → ícone + nome da empresa
 * - sem logo → fallback textual (PainelCRM / nome)
 */
export function TenantSidebarMark({ collapsed, className }: TenantSidebarMarkProps) {
  const { resolvedLogoUrl, company, loading } = useTenantBrand();
  const textFallback = company?.name?.trim() || 'PainelCRM';
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const presentation = useLogoPresentation(resolvedLogoUrl && !logoLoadFailed ? resolvedLogoUrl : null);
  const showIconWithName = presentation === 'icon' && !collapsed;

  useEffect(() => {
    setLogoLoadFailed(false);
  }, [resolvedLogoUrl]);

  if (loading && !company && !resolvedLogoUrl) {
    return (
      <div
        className={cn(
          'mb-6 flex items-center pb-2',
          collapsed ? 'justify-center' : 'justify-start px-4',
          className,
        )}
      >
        <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (resolvedLogoUrl && !logoLoadFailed) {
    return (
      <div
        className={cn(
          'mb-6 flex min-w-0 items-center gap-2 pb-2 sm:gap-3',
          collapsed ? 'justify-center' : 'justify-start px-4',
          className,
        )}
      >
        <img
          src={resolvedLogoUrl}
          alt=""
          className={cn(
            'object-contain object-left',
            showIconWithName
              ? 'h-9 w-9 shrink-0 rounded-md'
              : collapsed
                ? 'max-h-9 max-w-9 w-auto'
                : 'max-h-10 w-auto max-w-[min(200px,100%)]',
          )}
          onError={() => setLogoLoadFailed(true)}
        />
        {showIconWithName ? (
          <h1 className="truncate text-base font-bold text-sidebar-foreground sm:text-lg">
            {textFallback}
          </h1>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'mb-6 flex items-center pb-2',
        collapsed ? 'justify-center' : 'justify-start px-4',
        className,
      )}
    >
      {collapsed ? (
        <div
          className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-accent text-sm font-bold text-sidebar-foreground"
          title={textFallback}
        >
          {textFallback.slice(0, 2).toUpperCase()}
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Logo size="sm" variant="crm" className="shrink-0" />
          <h1 className="truncate text-base font-bold text-sidebar-foreground sm:text-lg">{textFallback}</h1>
        </div>
      )}
    </div>
  );
}
