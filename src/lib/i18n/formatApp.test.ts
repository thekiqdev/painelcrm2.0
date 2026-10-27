import { describe, expect, it } from 'vitest';
import i18n from './i18n';
import { formatAppDate, formatAppMoney, PILOT_SAMPLE_AT, PILOT_SAMPLE_CENTS } from './formatApp';

describe('namespace common (IX1)', () => {
  it('troca as strings do piloto com o idioma', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('save')).toBe('Save');
    expect(i18n.t('loading')).toBe('Loading...');
    await i18n.changeLanguage('es');
    expect(i18n.t('save')).toBe('Guardar');
    expect(i18n.t('empty')).toBe('Nada por aquí.');
    await i18n.changeLanguage('pt-BR');
    expect(i18n.t('save')).toBe('Salvar');
  });
});

describe('formatAppDate / formatAppMoney', () => {
  it('data e valor acompanham o locale', () => {
    const pt = formatAppDate(PILOT_SAMPLE_AT, 'P', 'pt-BR');
    const en = formatAppDate(PILOT_SAMPLE_AT, 'P', 'en');
    const es = formatAppDate(PILOT_SAMPLE_AT, 'P', 'es');
    expect(pt).toContain('15');
    expect(en).not.toBe(pt);
    expect(es).toContain('15');

    const brlPt = formatAppMoney(PILOT_SAMPLE_CENTS, 'BRL', 'pt-BR');
    const brlEn = formatAppMoney(PILOT_SAMPLE_CENTS, 'BRL', 'en');
    const usdEn = formatAppMoney(PILOT_SAMPLE_CENTS, 'USD', 'en');
    expect(brlPt).toMatch(/123/);
    expect(brlEn).toMatch(/123/);
    expect(brlPt).not.toBe(brlEn);
    expect(usdEn).not.toBe(brlEn);
  });
});
