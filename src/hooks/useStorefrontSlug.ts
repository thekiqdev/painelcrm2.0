import { useParams } from 'react-router-dom';
import { storefrontHref, useTenantHost } from '@/contexts/TenantHostContext';

/**
 * Slug da vitrine: path `/:storeSlug/loja` ou contexto do host customizado (TD S2).
 */
export function useStorefrontSlug(): {
  storeSlug: string | undefined;
  customHost: boolean;
  href: (suffix?: '' | `/produto/${string}` | '/checkout') => string;
} {
  const { storeSlug: paramSlug } = useParams<{ storeSlug?: string }>();
  const { isTenantHost, host } = useTenantHost();
  const customHost = Boolean(isTenantHost && host?.role === 'store');
  const storeSlug =
    (paramSlug && paramSlug.trim()) ||
    (customHost ? host?.store_slug?.trim() || undefined : undefined);

  return {
    storeSlug,
    customHost,
    href: (suffix = '') => storefrontHref(storeSlug, suffix, { customHost }),
  };
}
