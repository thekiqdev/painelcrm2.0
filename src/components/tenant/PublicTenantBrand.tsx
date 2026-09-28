import React, { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { FileText } from 'lucide-react';
import { resolveTenantLogoUrl, type TenantBrandUrls } from '@/utils/tenantBranding';
import { useLogoPresentation } from '@/hooks/useLogoPresentation';
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
 * Marca da empresa em páginas públicas: imagem conforme tema (claro/escuro + fallbacks)
 * ou texto quando não houver logo.
 * Logo ~1:1 → ícone + nome; horizontal → só a imagem.
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
  const [logoFailed, setLogoFailed] = useState(false);
  const presentation = useLogoPresentation(url && !logoFailed ? url : null);
  const showNameBesideLogo = presentation === 'icon' && !!name;

  useEffect(() => {
    setLogoFailed(false);
  }, [url]);

  if (url && !logoFailed) {
    return (
      <div className={cn('flex min-w-0 shrink-0 items-center gap-2', className)}>
        <img
          src={url}
          alt=""
          className={cn(
            'object-contain object-left',
            showNameBesideLogo
              ? 'h-11 w-11 shrink-0 rounded-md'
              : 'h-11 max-h-11 w-auto max-w-[180px]',
            imgClassName
          )}
          onError={() => setLogoFailed(true)}
        />
        {showNameBesideLogo ? (
          <span className={cn('truncate font-semibold text-foreground', textClassName)}>{name}</span>
        ) : null}
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
