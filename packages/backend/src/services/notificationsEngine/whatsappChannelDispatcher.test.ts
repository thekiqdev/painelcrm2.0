import { describe, expect, it } from 'vitest';
import { normalizeWhatsAppOutboundPlainText } from './whatsappChannelDispatcher.js';

describe('normalizeWhatsAppOutboundPlainText', () => {
  it('converte CRLF em LF e preserva parágrafos', () => {
    const out = normalizeWhatsAppOutboundPlainText('A\r\n\r\nB\r\n');
    expect(out).toBe('A\n\nB');
  });

  it('remove espaços antes de quebras de linha', () => {
    expect(normalizeWhatsAppOutboundPlainText('Olá   \nMundo')).toBe('Olá\nMundo');
  });

  it('colapsa três ou mais quebras seguidas no máximo a um parágrafo (dupla quebra)', () => {
    expect(normalizeWhatsAppOutboundPlainText('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('colapsa espaços múltiplos dentro da linha', () => {
    expect(normalizeWhatsAppOutboundPlainText('Um    dois')).toBe('Um dois');
  });

  it('preserva asteriscos de markdown simples', () => {
    expect(normalizeWhatsAppOutboundPlainText('*Valor:* 10')).toBe('*Valor:* 10');
  });
});
