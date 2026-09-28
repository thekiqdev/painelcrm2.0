import { describe, expect, it } from 'vitest';
import { formatBrazilPhoneDigitsForDisplay } from './brPhoneDisplay.js';

describe('formatBrazilPhoneDigitsForDisplay', () => {
  it('formata 11 dígitos nacionais', () => {
    expect(formatBrazilPhoneDigitsForDisplay('11987654321')).toBe('(11) 98765-4321');
  });

  it('remove prefixo 55 para exibição', () => {
    expect(formatBrazilPhoneDigitsForDisplay('5511987654321')).toBe('(11) 98765-4321');
  });
});
