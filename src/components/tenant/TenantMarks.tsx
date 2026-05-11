import { useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { useTenantBrand } from '@/contexts/TenantBrandContext';
import { cn } from '@/lib/utils';

type TenantSidebarMarkProps = {
  collapsed: boolean;
  /** Ajusta margens/padding quando a marca fica no cabeçalho ao lado do trigger (ex.: `!mb-0 min-w-0 flex-1 px-0`). */
  className?: string;
};

/** Bloco superior da sidebar: só a logo quando existir; caso contrário fallback textual (nome da empresa ou PainelCRM). */
export function TenantSidebarMark({ collapsed, className }: TenantSidebarMarkProps) {
  const { resolvedLogoUrl, company, loading } = useTenantBrand();
  const textFallback = company?.name?.trim() || 'PainelCRM';
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

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
          'mb-6 flex min-w-0 items-center pb-2',
          collapsed ? 'justify-center' : 'justify-start px-4',
          className,
        )}
      >
        <img
          src={resolvedLogoUrl}
          alt=""
          className={cn(
            'w-auto object-contain object-left',
            collapsed ? 'max-h-9 max-w-9' : 'max-h-10 max-w-[min(200px,100%)]',
          )}
          onError={() => setLogoLoadFailed(true)}
        />
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
