/**
 * Classificação mínima de erros de envio WhatsApp (Fase 4 — retry transitório).
 * Sprint 3: Invalid token / 401 / 403 / disconnected → transient (teto em max_attempts).
 * Não regenera token no worker — retries dão janela para reconnect humano.
 */

export type DispatchErrorClass = 'transient' | 'definitive';

export function classifyWhatsAppDispatchError(message: string): DispatchErrorClass {
  const m = String(message || '').toLowerCase();
  if (!m.trim()) return 'transient';

  // Erros de configuração / destinatário — não adianta retentar
  if (m.includes('remetente não pertence')) return 'definitive';
  if (m.includes('nenhuma instância whatsapp')) return 'definitive';
  if (m.includes('instância whatsapp de roteamento não encontrada')) return 'definitive';
  if (m.includes('dono da instância whatsapp não pertence')) return 'definitive';
  if (m.includes('400') && (m.includes('bad request') || m.includes('número'))) return 'definitive';

  // Sessão / token Uaz — transient com teto de tentativas (Sprint 3)
  if (m.includes('401') || m.includes('403')) return 'transient';
  if (m.includes('invalid') && m.includes('token')) return 'transient';
  if (m.includes('token inválido')) return 'transient';
  if (m.includes('whatsapp disconnected')) return 'transient';
  if (m.includes('não está conectada')) return 'transient';

  if (m.includes('429')) return 'transient';
  if (m.includes('502') || m.includes('503') || m.includes('504')) return 'transient';
  if (m.includes('econnrefused') || m.includes('etimedout') || m.includes('enotfound')) return 'transient';
  if (m.includes('socket') || m.includes('network') || m.includes('fetch failed')) return 'transient';
  if (m.includes('timeout')) return 'transient';

  return 'transient';
}
