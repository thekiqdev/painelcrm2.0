const PUBLIC_MARKETING_PREFIXES = [
  '/',
  '/landing',
  '/login',
  '/register',
  '/checkout',
  '/signup-success',
  '/forgot-password',
  '/privacy',
  '/terms',
  '/contract-view/',
  '/contract-sign/',
  '/proposal-view/',
  '/pay/',
  '/saas-billing/',
  '/store/',
  '/suporte',
];

export function isPublicMarketingPath(pathname: string): boolean {
  const path = (pathname || '/').split('?')[0] || '/';
  if (path === '/') return true;
  if (path.startsWith('/superadmin') || path.startsWith('/dashboard')) return false;
  if (path.startsWith('/chat') || path.startsWith('/settings')) return false;
  return PUBLIC_MARKETING_PREFIXES.some((prefix) => {
    if (prefix === '/') return path === '/';
    return path === prefix || path.startsWith(prefix);
  });
}
