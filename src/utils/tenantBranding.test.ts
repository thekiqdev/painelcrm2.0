import { describe, expect, it } from 'vitest';
import { classifyLogoAspect, LOGO_ICON_MAX_ASPECT } from '@/utils/tenantBranding';

describe('classifyLogoAspect', () => {
  it('trata ~1:1 como ícone', () => {
    expect(classifyLogoAspect(128, 128)).toBe('icon');
    expect(classifyLogoAspect(100, 90)).toBe('icon');
    expect(classifyLogoAspect(LOGO_ICON_MAX_ASPECT * 100, 100)).toBe('icon');
  });

  it('trata horizontal como wordmark', () => {
    expect(classifyLogoAspect(320, 80)).toBe('wordmark');
    expect(classifyLogoAspect(200, 100)).toBe('wordmark');
  });

  it('fallback seguro para dimensões inválidas', () => {
    expect(classifyLogoAspect(0, 0)).toBe('wordmark');
    expect(classifyLogoAspect(-1, 10)).toBe('wordmark');
  });
});
