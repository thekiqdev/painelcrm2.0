import { describe, expect, it } from 'vitest';
import { resolveAppLocale } from './appLocale';

describe('resolveAppLocale (IX1)', () => {
  it('segue query, cookie, perfil e navegador', () => {
    expect(resolveAppLocale({ query: 'es', cookie: 'en', profile: 'pt-BR' })).toBe('es');
    expect(resolveAppLocale({ cookie: 'en-US', profile: 'es' })).toBe('en');
    expect(resolveAppLocale({ profile: 'es', languages: ['en'] })).toBe('es');
    expect(resolveAppLocale({ languages: ['es-MX', 'en'] })).toBe('es');
    expect(resolveAppLocale({ languages: ['fr'] })).toBe('pt-BR');
  });
});
