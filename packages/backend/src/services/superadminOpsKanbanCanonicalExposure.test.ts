import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../utils/db.js';
import {
  listCanonicalOpsBoardIds,
  OPS_KANBAN_CANONICAL_BOARD_NAMES,
} from './superadminOpsKanbanFoundation.js';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn() },
}));

describe('Ops Kanban canonical board exposure (Sprint N2.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('OPS_KANBAN_CANONICAL_BOARD_NAMES includes Engajamento Trial as 6th board', () => {
    expect(OPS_KANBAN_CANONICAL_BOARD_NAMES).toHaveLength(6);
    expect(OPS_KANBAN_CANONICAL_BOARD_NAMES[5]).toBe('Engajamento Trial');
  });

  it('listCanonicalOpsBoardIds resolves all six canonical boards', async () => {
    const idsByName: Record<string, string> = {
      Aquisição: 'id-aquisicao',
      Recovery: 'id-recovery',
      Onboarding: 'id-onboarding',
      Expansão: 'id-expansao',
      Reativação: 'id-reativacao',
      'Engajamento Trial': 'id-engajamento',
    };

    vi.mocked(pool.query).mockImplementation(async (_sql: unknown, params?: unknown[]) => {
      const name = (params as string[] | undefined)?.[1];
      const id = name ? idsByName[name] : undefined;
      return { rows: id ? [{ id }] : [], rowCount: id ? 1 : 0 } as never;
    });

    const ids = await listCanonicalOpsBoardIds();

    expect(ids.size).toBe(6);
    expect(ids.has('id-engajamento')).toBe(true);
    for (const name of OPS_KANBAN_CANONICAL_BOARD_NAMES) {
      expect(ids.has(idsByName[name]!)).toBe(true);
    }
  });
});
