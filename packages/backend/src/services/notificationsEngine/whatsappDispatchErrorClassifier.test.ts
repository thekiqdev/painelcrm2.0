import { describe, it, expect } from 'vitest';
import { classifyWhatsAppDispatchError } from './whatsappDispatchErrorClassifier.js';

describe('classifyWhatsAppDispatchError', () => {
  it('classifica instância ausente como definitivo', () => {
    expect(classifyWhatsAppDispatchError('Nenhuma instância WhatsApp ativa')).toBe('definitive');
  });
  it('classifica 503 como transitório', () => {
    expect(classifyWhatsAppDispatchError('upstream 503')).toBe('transient');
  });
  it('classifica WhatsApp disconnected / não conectada como transitório', () => {
    expect(classifyWhatsAppDispatchError('WhatsApp disconnected')).toBe('transient');
    expect(classifyWhatsAppDispatchError('Instância WhatsApp não está conectada (status=disconnected)')).toBe(
      'transient',
    );
  });
});
