/**
 * Contexto efémero para criação de proposta/fatura ao sair do Chat via rota global.
 * Evita duplicar layout embutido e mantém dados de contacto para notificação/timeline.
 */
const STORAGE_KEY = 'painelcrm_chat_commerce_create_ctx_v1';

export type ChatCommerceCreateContext = {
  conversationId: string;
  contactDisplayName: string;
  phone?: string | null;
  email?: string | null;
  crmClientId?: string | null;
};

export function stashChatCommerceCreateContext(payload: ChatCommerceCreateContext): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...payload, t: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function peekChatCommerceCreateContext(expectedConversationId: string): ChatCommerceCreateContext | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as ChatCommerceCreateContext & { t?: number };
    if (!o?.conversationId || o.conversationId !== expectedConversationId) return null;
    return {
      conversationId: o.conversationId,
      contactDisplayName: o.contactDisplayName,
      phone: o.phone,
      email: o.email,
      crmClientId: o.crmClientId,
    };
  } catch {
    return null;
  }
}

export function consumeChatCommerceCreateContext(expectedConversationId: string): ChatCommerceCreateContext | null {
  const p = peekChatCommerceCreateContext(expectedConversationId);
  if (!p) return null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return p;
}
