/**
 * Chamadas HTTP OAuth / API Mercado Pago (isolado).
 */

export type MercadoPagoTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
  live_mode?: boolean;
  user_id?: number;
  [key: string]: unknown;
};

export async function exchangeAuthorizationCode(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  /** PKCE — obrigatório quando o authorize enviou code_challenge (Mercado Pago produção). */
  codeVerifier: string;
}): Promise<MercadoPagoTokenResponse> {
  const body: Record<string, string> = {
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    grant_type: 'authorization_code',
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  };
  const res = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Mercado Pago oauth/token ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as MercadoPagoTokenResponse;
}

export async function getMercadoPagoUserMe(accessToken: string): Promise<{ id?: unknown; nickname?: string; email?: string }> {
  const res = await fetch('https://api.mercadopago.com/users/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Mercado Pago users/me ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as { id?: unknown; nickname?: string; email?: string };
}
