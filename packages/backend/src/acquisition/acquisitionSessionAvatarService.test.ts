import { describe, expect, it } from 'vitest';
import {
  normalizeSessionAvatarInput,
  resolveSessionAvatarDisplay,
  MAX_SESSION_AVATAR_DATA_URL_CHARS,
} from './acquisitionSessionAvatarService.js';

describe('acquisitionSessionAvatarService', () => {
  it('normalizes valid data url', () => {
    const dataUrl = 'data:image/png;base64,abc';
    const out = normalizeSessionAvatarInput({ avatar_data_url: dataUrl });
    expect(out?.data_url).toBe(dataUrl);
    expect(out?.updated_at).toBeTruthy();
  });

  it('rejects oversized data url', () => {
    const huge = 'data:image/png;base64,' + 'a'.repeat(MAX_SESSION_AVATAR_DATA_URL_CHARS);
    expect(normalizeSessionAvatarInput({ avatar_data_url: huge })).toBeNull();
  });

  it('resolves display from metadata', () => {
    expect(
      resolveSessionAvatarDisplay({
        avatar: { data_url: 'data:image/jpeg;base64,xx', updated_at: 't' },
      }),
    ).toBe('data:image/jpeg;base64,xx');
  });
});
