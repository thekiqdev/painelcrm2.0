/** Lista de origem ao abrir o Chat a partir de `/leads` ou `/clients` (mobile). */
export const CHAT_LIST_RETURN_LEADS = '/leads';
export const CHAT_LIST_RETURN_CLIENTS = '/clients';

/** Abrir chat a partir do perfil do cliente: o botão «voltar» na thread retorna ao perfil. */
export const CHAT_RETURN_CLIENT_PROFILE = 'clientProfile';

export function isChatListReturnPath(v: string | null | undefined): v is typeof CHAT_LIST_RETURN_LEADS | typeof CHAT_LIST_RETURN_CLIENTS {
  return v === CHAT_LIST_RETURN_LEADS || v === CHAT_LIST_RETURN_CLIENTS;
}

export function isChatClientProfileReturn(v: string | null | undefined): boolean {
  return v === CHAT_RETURN_CLIENT_PROFILE;
}

/** Query para `/chat` abrir a conversa WhatsApp do cliente e voltar ao perfil no mobile. */
export function chatOpenQueryFromClientProfile(clientId: string): string {
  const q = new URLSearchParams();
  q.set('openClientId', clientId);
  q.set('returnTo', CHAT_RETURN_CLIENT_PROFILE);
  return `?${q.toString()}`;
}

export function chatOpenQueryWithReturn(
  params: { openLeadId?: string; openClientId?: string },
): string {
  const q = new URLSearchParams();
  if (params.openLeadId) {
    q.set('openLeadId', params.openLeadId);
    q.set('returnTo', CHAT_LIST_RETURN_LEADS);
  } else if (params.openClientId) {
    q.set('openClientId', params.openClientId);
    q.set('returnTo', CHAT_LIST_RETURN_CLIENTS);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}
