/**
 * Herança legacy (opcional): mover conversas de outras instâncias com o mesmo `phone_key` ao conectar.
 *
 * Política de produto: **por defeito NÃO herda** — reconexão limpa; não depende de ENV para segurança.
 * Só herda se `WHATSAPP_INHERIT_CONVERSATIONS_ON_CONNECT` for explicitamente verdadeiro (`true`, `1`, `on`, `yes`).
 */
export function isWhatsappPhoneKeyInheritEnabled(): boolean {
  const v = process.env.WHATSAPP_INHERIT_CONVERSATIONS_ON_CONNECT?.trim().toLowerCase();
  if (!v) return false;
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}
