import { useEffect, useState } from 'react';
import {
  classifyLogoAspect,
  type TenantLogoPresentation,
} from '@/utils/tenantBranding';

/**
 * Classifica a logo pelo aspect ratio real da imagem (wordmark vs ícone ~1:1).
 * Enquanto carrega, assume wordmark (só logo — comportamento legado).
 */
export function useLogoPresentation(logoUrl: string | null | undefined): TenantLogoPresentation {
  const [presentation, setPresentation] = useState<TenantLogoPresentation>('wordmark');

  useEffect(() => {
    if (!logoUrl) {
      setPresentation('wordmark');
      return;
    }
    setPresentation('wordmark');
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setPresentation(classifyLogoAspect(img.naturalWidth, img.naturalHeight));
    };
    img.onerror = () => {
      if (!cancelled) setPresentation('wordmark');
    };
    img.src = logoUrl;
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);

  return presentation;
}
