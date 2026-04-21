import React from 'react';
import { useTheme } from 'next-themes';
import { FileText } from 'lucide-react';
import { resolveTenantLogoUrl, type TenantBrandUrls } from '@/utils/tenantBranding';
import { cn } from '@/lib/utils';

export type PublicTenantBrandingInput = TenantBrandUrls & { name?: string | null };

type Props = {
  branding: PublicTenantBrandingInput;
  className?: string;
  imgClassName?: string;
  textClassName?: string;
  fallbackIcon?: React.ReactNode;
  /** Quando não há logo: não repetir o nome ao lado do ícone (ex.: nome já vai noutra linha). */
  nameShownElsewhere?: boolean;
};

/**
 * Marca do tenant em páginas públicas: imagem conforme tema (claro/escuro + fallbacks)
 * ou apenas texto quando não houver logo.
 */
export function PublicTenantBrandMark({
  branding,
  className,
  imgClassName,
  textClassName,
  fallbackIcon,
  nameShownElsewhere = false,
}: Props) {
  const { resolvedTheme } = useTheme();
  const url = resolveTenantLogoUrl(resolvedTheme, branding);
  const name = branding.name?.trim() || '';

  if (url) {
    return (
      <div className={cn('flex min-w-0 shrink-0 items-center', className)}>
        <img
          src={url}
          alt=""
          className={cn(
            'h-11 max-h-11 w-auto max-w-[180px] object-contain object-left',
            imgClassName
          )}
        />
      </div>
    );
  }

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted">
        {fallbackIcon ?? <FileText className="h-5 w-5 text-muted-foreground" />}
      </div>
      {!nameShownElsewhere && name ? (
        <span className={cn('truncate font-semibold text-foreground', textClassName)}>{name}</span>
      ) : null}
    </div>
  );
}
