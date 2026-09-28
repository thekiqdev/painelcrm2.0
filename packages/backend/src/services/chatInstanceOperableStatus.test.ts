import { describe, expect, it } from 'vitest';
import {
  isChatInstanceStatusOperable,
  isUazWhatsAppDisconnectedSignal,
  mapUazStatusPayloadToDbStatus,
} from './chatInstanceOperableStatus.js';

describe('isChatInstanceStatusOperable', () => {
  it('aceita connected e open', () => {
    expect(isChatInstanceStatusOperable('connected')).toBe(true);
    expect(isChatInstanceStatusOperable('open')).toBe(true);
    expect(isChatInstanceStatusOperable('OPEN')).toBe(true);
  });

  it('rejeita disconnected / connecting', () => {
    expect(isChatInstanceStatusOperable('disconnected')).toBe(false);
    expect(isChatInstanceStatusOperable('connecting')).toBe(false);
    expect(isChatInstanceStatusOperable(null)).toBe(false);
  });
});

describe('mapUazStatusPayloadToDbStatus', () => {
  it('mapeia open/connected/loggedIn para connected', () => {
    expect(mapUazStatusPayloadToDbStatus({ status: 'open' }, 'disconnected')).toBe('connected');
    expect(mapUazStatusPayloadToDbStatus({ instance: { state: 'connected' } }, 'disconnected')).toBe(
      'connected',
    );
    expect(mapUazStatusPayloadToDbStatus({ connected: true }, 'disconnected')).toBe('connected');
    expect(mapUazStatusPayloadToDbStatus({ loggedIn: true }, 'disconnected')).toBe('connected');
  });

  it('preserva disconnected e fallback', () => {
    expect(mapUazStatusPayloadToDbStatus({ status: 'disconnected' }, 'connected')).toBe('disconnected');
    expect(mapUazStatusPayloadToDbStatus({}, 'connecting')).toBe('connecting');
  });
});

describe('isUazWhatsAppDisconnectedSignal', () => {
  it('detecta mensagem e 503 disconnect', () => {
    expect(isUazWhatsAppDisconnectedSignal('WhatsApp disconnected', 503)).toBe(true);
    expect(isUazWhatsAppDisconnectedSignal('upstream disconnect', 503)).toBe(true);
    expect(isUazWhatsAppDisconnectedSignal('timeout', 504)).toBe(false);
  });
});
