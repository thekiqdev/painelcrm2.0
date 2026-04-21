import { Logo } from '@/components/Logo';
import { useTenantBrand } from '@/contexts/TenantBrandContext';

/** Bloco superior da sidebar: só a logo quando existir; caso contrário fallback textual (nome da empresa ou PainelCRM). */
export function TenantSidebarMark({ collapsed }: { collapsed: boolean }) {
  const { resolvedLogoUrl, company, loading } = useTenantBrand();
  const textFallback = company?.name?.trim() || 'PainelCRM';

  if (loading && !company && !resolvedLogoUrl) {
    return (
      <div className={`mb-6 flex items-center pb-2 ${collapsed ? 'justify-center' : 'justify-start px-4'}`}>
        <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (resolvedLogoUrl) {
    return (
      <div
        className={`mb-6 flex min-w-0 items-center pb-2 ${collapsed ? 'justify-center' : 'justify-start px-4'}`}
      >
        <img
          src={resolvedLogoUrl}
          alt=""
          className={`w-auto object-contain object-left ${collapsed ? 'max-h-9 max-w-9' : 'max-h-10 max-w-[200px]'}`}
        />
      </div>
    );
  }

  return (
    <div className={`mb-6 flex items-center pb-2 ${collapsed ? 'justify-center' : 'justify-start px-4'}`}>
      {collapsed ? (
        <div
          className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-accent text-sm font-bold text-sidebar-foreground"
          title={textFallback}
        >
          {textFallback.slice(0, 2).toUpperCase()}
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-3">
          <Logo size="sm" variant="crm" className="shrink-0" />
          <h1 className="truncate text-lg font-bold text-sidebar-foreground">{textFallback}</h1>
        </div>
      )}
    </div>
  );
}
