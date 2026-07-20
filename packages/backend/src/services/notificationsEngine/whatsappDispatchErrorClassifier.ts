/**
 * Classificação mínima de erros de envio WhatsApp (Fase 4 — retry transitório).
 */

export type DispatchErrorClass = 'transient' | 'definitive';

export function classifyWhatsAppDispatchError(message: string): DispatchErrorClass {
  const m = String(message || '').toLowerCase();
  if (!m.trim()) return 'transient';

  if (m.includes('remetente não pertence')) return 'definitive';
  if (m.includes('nenhuma instância whatsapp')) return 'definitive';
  if (m.includes('401') || m.includes('403')) return 'definitive';
  if (m.includes('invalid') && m.includes('token')) return 'definitive';

  if (m.includes('400') && (m.includes('bad request') || m.includes('número'))) return 'definitive';

  // Sessão WhatsApp offline na Uaz — retry após reconnect / refresh de status
  if (m.includes('whatsapp disconnected')) return 'transient';
  if (m.includes('não está conectada')) return 'transient';

  if (m.includes('429')) return 'transient';
  if (m.includes('502') || m.includes('503') || m.includes('504')) return 'transient';
  if (m.includes('econnrefused') || m.includes('etimedout') || m.includes('enotfound')) return 'transient';
  if (m.includes('socket') || m.includes('network') || m.includes('fetch failed')) return 'transient';
  if (m.includes('timeout')) return 'transient';

  return 'transient';
}
