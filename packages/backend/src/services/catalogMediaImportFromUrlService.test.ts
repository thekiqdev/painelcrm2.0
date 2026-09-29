import { describe, expect, it } from 'vitest';
import { assertSafeRemoteImageUrl } from './catalogMediaImportFromUrlService.js';

describe('assertSafeRemoteImageUrl', () => {
  it('aceita https público', () => {
    const u = assertSafeRemoteImageUrl('https://cdn.example.com/a.jpg');
    expect(u.hostname).toBe('cdn.example.com');
  });

  it('bloqueia localhost e IP privado', () => {
    expect(() => assertSafeRemoteImageUrl('http://127.0.0.1/x.jpg')).toThrow(/local|privado/i);
    expect(() => assertSafeRemoteImageUrl('http://192.168.0.10/x.jpg')).toThrow(/privado/i);
    expect(() => assertSafeRemoteImageUrl('http://10.0.0.5/x.jpg')).toThrow(/privado/i);
  });

  it('bloqueia esquemas não http', () => {
    expect(() => assertSafeRemoteImageUrl('file:///etc/passwd')).toThrow();
    expect(() => assertSafeRemoteImageUrl('ftp://example.com/a.jpg')).toThrow(/http/i);
  });
});
