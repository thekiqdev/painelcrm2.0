import { describe, expect, it } from 'vitest';
import { resolveAssigneeAvatarSrc } from '@/lib/assigneeAvatarUrl';

describe('resolveAssigneeAvatarSrc', () => {
  it('returns null for empty', () => {
    expect(resolveAssigneeAvatarSrc(null)).toBeNull();
    expect(resolveAssigneeAvatarSrc('')).toBeNull();
    expect(resolveAssigneeAvatarSrc('   ')).toBeNull();
  });

  it('keeps absolute https URLs', () => {
    const src = resolveAssigneeAvatarSrc('https://cdn.example/kaique.jpg');
    expect(src).toBe('https://cdn.example/kaique.jpg');
  });

  it('resolves catalog-media relative paths (same family as header profile)', () => {
    const raw = '/api/public/catalog-media/raw?k=tenants%2Fx%2Fusers%2Fy%2Fa.jpg&s=sig';
    const src = resolveAssigneeAvatarSrc(raw);
    expect(src).toBeTruthy();
    expect(src!).toContain('/api/public/catalog-media/raw');
  });
});
