import { describe, expect, it } from 'vitest';
import {
  CUSTOM_WHATSAPP_BELOW_USAGE_MSG,
  CUSTOM_WHATSAPP_QUANTITY_REQUIRED_MSG,
  validateCustomWhatsAppOverride,
  validateCustomWhatsAppOverrideAgainstUsage,
} from './customPlanWhatsAppContract.js';

describe('validateCustomWhatsAppOverride', () => {
  it('rejeita null/undefined', () => {
    expect(validateCustomWhatsAppOverride(null)).toBe(CUSTOM_WHATSAPP_QUANTITY_REQUIRED_MSG);
    expect(validateCustomWhatsAppOverride(undefined)).toBe(CUSTOM_WHATSAPP_QUANTITY_REQUIRED_MSG);
  });

  it('aceita 0 e inteiros positivos', () => {
    expect(validateCustomWhatsAppOverride(0)).toBeNull();
    expect(validateCustomWhatsAppOverride(3)).toBeNull();
  });

  it('rejeita negativo ou não-inteiro', () => {
    expect(validateCustomWhatsAppOverride(-1)).toBe(CUSTOM_WHATSAPP_QUANTITY_REQUIRED_MSG);
    expect(validateCustomWhatsAppOverride(1.5)).toBe(CUSTOM_WHATSAPP_QUANTITY_REQUIRED_MSG);
  });
});

describe('validateCustomWhatsAppOverrideAgainstUsage', () => {
  it('bloqueia abaixo do uso', () => {
    expect(validateCustomWhatsAppOverrideAgainstUsage(1, 2)).toBe(CUSTOM_WHATSAPP_BELOW_USAGE_MSG);
  });

  it('aceita igual ou acima do uso', () => {
    expect(validateCustomWhatsAppOverrideAgainstUsage(2, 2)).toBeNull();
    expect(validateCustomWhatsAppOverrideAgainstUsage(5, 2)).toBeNull();
  });
});
