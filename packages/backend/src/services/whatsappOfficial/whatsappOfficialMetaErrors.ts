/**
 * Erros OAuth da Graph API Meta — 190 = token expirado ou revogado.
 * @see https://developers.facebook.com/docs/graph-api/guides/error-handling
 */
export function isMetaAccessTokenExpiredGraphMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('session has expired') ||
    m.includes('access token has expired') ||
    m.includes('error validating access token') ||
    /\bcode\s*190\b/.test(m) ||
    /\b190\s*\/\s*\d+\b/.test(m)
  );
}

export class MetaAccessTokenExpiredError extends Error {
  readonly code = 'META_TOKEN_EXPIRED' as const;
  constructor() {
    super(
      'O access token da Meta expirou ou foi revogado (erro 190). No Meta Developer Hub → a sua app → WhatsApp → API Setup, gere um token de sistema permanente novo, cole em Super Admin → Conexões → WhatsApp oficial, guarde e volte a sincronizar os modelos.'
    );
    this.name = 'MetaAccessTokenExpiredError';
  }
}
