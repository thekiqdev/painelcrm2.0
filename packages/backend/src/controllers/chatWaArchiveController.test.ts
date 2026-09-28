import { describe, expect, it } from 'vitest';
import { resolveUazArchiveNumber } from './chatWaArchiveController.js';

describe('resolveUazArchiveNumber', () => {
  it('uses E.164 digits from individual JID', () => {
    expect(
      resolveUazArchiveNumber({
        external_chat_id: '5511999999999@s.whatsapp.net',
      }),
    ).toBe('5511999999999');
  });

  it('keeps group JID intact', () => {
    expect(
      resolveUazArchiveNumber({
        external_chat_id: '120363123456789012@g.us',
      }),
    ).toBe('120363123456789012@g.us');
  });

  it('falls back to phone_number digits', () => {
    expect(
      resolveUazArchiveNumber({
        phone_number: '+55 11 98888-7777',
      }),
    ).toBe('5511988887777');
  });

  it('returns null without identifier', () => {
    expect(resolveUazArchiveNumber({})).toBeNull();
  });
});
