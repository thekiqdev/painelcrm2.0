/**
 * Integração Google Drive (OAuth + Drive API).
 * Ative com ENABLE_GOOGLE_DRIVE=true; reutiliza GOOGLE_CLIENT_ID / SECRET; redirect dedicado ou derivado do Calendar.
 */

export function isGoogleDriveIntegrationEnabled(): boolean {
  return String(process.env.ENABLE_GOOGLE_DRIVE || '').toLowerCase() === 'true';
}

function maskGoogleClientId(clientId: string): string {
  const t = clientId.trim();
  if (!t) return '(não definido)';
  if (t.length <= 20) return '***';
  return `${t.slice(0, 12)}…${t.slice(-8)}`;
}

/** Redirect OAuth para Drive; obrigatório na Google Cloud como URI autorizado (distinto do Calendar). */
export function getGoogleDriveRedirectUri(): string | null {
  const explicit = String(process.env.GOOGLE_DRIVE_REDIRECT_URI || '').trim();
  if (explicit) return explicit;
  const cal = String(process.env.GOOGLE_REDIRECT_URI || '').trim();
  if (cal.includes('/api/integrations/google/callback')) {
    return cal.replace('/api/integrations/google/callback', '/api/integrations/google-drive/callback');
  }
  return null;
}

export function getGoogleDriveOAuthClientConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} | null {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const redirectUri = getGoogleDriveRedirectUri();
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function logGoogleDriveBootDiagnostics(): void {
  const enabled = isGoogleDriveIntegrationEnabled();
  const rawId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const rawDriveRedirect = String(process.env.GOOGLE_DRIVE_REDIRECT_URI || '').trim();
  const derived = getGoogleDriveRedirectUri();
  if (!enabled && !rawId && !rawDriveRedirect && !derived) {
    return;
  }
  const frontend = String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  const cfg = getGoogleDriveOAuthClientConfig();
  console.log('[google-drive:boot]', {
    ENABLE_GOOGLE_DRIVE: enabled,
    FRONTEND_URL: frontend,
    GOOGLE_CLIENT_ID: maskGoogleClientId(rawId),
    GOOGLE_DRIVE_REDIRECT_URI: derived || '(não definido — OAuth Drive incompleto)',
    oauth_ready: !!cfg,
  });
  if (enabled && !cfg) {
    console.warn(
      '[google-drive:boot] ENABLE_GOOGLE_DRIVE=true mas faltam GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e/ou redirect Drive (GOOGLE_DRIVE_REDIRECT_URI ou GOOGLE_REDIRECT_URI derivável)',
    );
  }
}

export function assertGoogleDriveConfigured(): void {
  if (!isGoogleDriveIntegrationEnabled()) {
    throw new Error('Integração Google Drive desativada (ENABLE_GOOGLE_DRIVE).');
  }
  if (!getGoogleDriveOAuthClientConfig()) {
    throw new Error(
      'Google Drive OAuth não configurado (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirect Drive).',
    );
  }
}
