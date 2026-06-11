import { describe, expect, it, vi } from 'vitest';
import { computeMigrationChecksum } from './schemaMigrationsRepository.js';

describe('schemaMigrationsRepository', () => {
  it('checksum estável para o mesmo conteúdo', () => {
    const a = computeMigrationChecksum('SELECT 1;');
    const b = computeMigrationChecksum('SELECT 1;');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('checksum muda quando o SQL muda', () => {
    const a = computeMigrationChecksum('SELECT 1;');
    const b = computeMigrationChecksum('SELECT 2;');
    expect(a).not.toBe(b);
  });
});
