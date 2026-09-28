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
  it('Sprint 3: Invalid token / 401 / 403 como transitório (retry até max_attempts)', () => {
    expect(classifyWhatsAppDispatchError('Invalid token.')).toBe('transient');
    expect(classifyWhatsAppDispatchError('Invalid token')).toBe('transient');
    expect(classifyWhatsAppDispatchError('Token inválido detectado')).toBe('transient');
    expect(classifyWhatsAppDispatchError('UazAPI 401')).toBe('transient');
    expect(classifyWhatsAppDispatchError('forbidden 403')).toBe('transient');
  });
  it('mantém bad request de número como definitivo', () => {
    expect(classifyWhatsAppDispatchError('400 Bad Request número inválido')).toBe('definitive');
  });
});
