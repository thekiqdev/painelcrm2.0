import { describe, expect, it } from 'vitest';
import {
  canonicalizeStoredLocale,
  localeErrorMessage,
  resolveAppLocale,
  resolveRequestLocale,
} from './appLocale.js';

describe('resolveAppLocale (IX1)', () => {
  it('cookie ganha do perfil e do navegador', () => {
    expect(
      resolveAppLocale({
        cookie: 'en',
        profile: 'es',
        languages: ['pt-BR'],
      })
    ).toBe('en');
  });

  it('perfil ganha do navegador quando não há cookie', () => {
    expect(
      resolveAppLocale({
        profile: 'es',
        languages: ['en-US'],
      })
    ).toBe('es');
  });

  it('en-US do navegador vira en', () => {
    expect(resolveAppLocale({ languages: ['en-US', 'pt-BR'] })).toBe('en');
  });

  it('query ganha do cookie', () => {
    expect(resolveAppLocale({ query: 'es', cookie: 'en' })).toBe('es');
  });

  it('sem pista cai em pt-BR', () => {
    expect(resolveAppLocale({})).toBe('pt-BR');
    expect(resolveAppLocale({ languages: ['fr-FR'] })).toBe('pt-BR');
  });
});

describe('resolveRequestLocale', () => {
  it('lê o cookie painelcrm_locale', () => {
    expect(
      resolveRequestLocale({
        cookieHeader: 'other=1; painelcrm_locale=es',
        acceptLanguage: 'en-US',
      })
    ).toBe('es');
  });

  it('header X-App-Locale cobre Accept-Language quando não há cookie', () => {
    expect(
      resolveRequestLocale({
        appLocaleHeader: 'en-US',
        acceptLanguage: 'es-MX,es;q=0.9',
      })
    ).toBe('en');
  });
});

describe('canonicalizeStoredLocale', () => {
  it('normaliza alias e vazio', () => {
    expect(canonicalizeStoredLocale('en-US')).toEqual({ ok: true, locale: 'en' });
    expect(canonicalizeStoredLocale('  ')).toEqual({ ok: true, locale: null });
    expect(canonicalizeStoredLocale(null)).toEqual({ ok: true, locale: null });
  });

  it('rejeita código fora do catálogo', () => {
    expect(canonicalizeStoredLocale('fr')).toEqual({ ok: false });
  });
});

describe('localeErrorMessage', () => {
  it('traduz o erro piloto', () => {
    expect(localeErrorMessage('en', 'invalid_locale')).toMatch(/Invalid language/);
    expect(localeErrorMessage('es', 'invalid_locale')).toMatch(/Idioma no válido/);
    expect(localeErrorMessage('pt-BR', 'invalid_locale')).toMatch(/Idioma inválido/);
  });
});
