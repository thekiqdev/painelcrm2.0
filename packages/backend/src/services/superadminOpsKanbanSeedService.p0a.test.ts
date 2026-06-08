import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { connect: vi.fn(), query: vi.fn() },
}));

vi.mock('../utils/kanbanRlsTx.js', () => ({
  beginKanbanTxWithRls: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../acquisition/acquisitionLeadRepository.js', () => ({
  acquisitionLeadsTableExists: vi.fn().mockResolvedValue(false),
}));

vi.mock('./superadminOpsKanbanLeadService.js', () => ({
  syncAcquisitionLeadToOpsKanban: vi.fn(),
}));

vi.mock('./superadminOpsKanbanFoundation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./superadminOpsKanbanFoundation.js')>();
  return {
    ...actual,
    assertSuperadminOpsTenantExists: vi.fn(),
    acquireOpsKanbanSeedAdvisoryLock: vi.fn().mockResolvedValue(undefined),
    findCanonicalOpsBoardIdByName: vi.fn(),
    runSerializedOpsKanbanSeed: vi.fn((fn: () => Promise<unknown>) => fn()),
  };
});

import { pool } from '../utils/db.js';
import { assertSuperadminOpsTenantExists, findCanonicalOpsBoardIdByName } from './superadminOpsKanbanFoundation.js';
import { ensureSuperadminOpsKanbanSeed } from './superadminOpsKanbanSeedService.js';

describe('ensureSuperadminOpsKanbanSeed P0-A', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ops_tenant_missing without partial seed', async () => {
    vi.mocked(assertSuperadminOpsTenantExists).mockResolvedValue({
      ok: false,
      reason: 'ops_tenant_missing',
    });

    const result = await ensureSuperadminOpsKanbanSeed('actor-1');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('ops_tenant_missing');
    expect(result.boards).toHaveLength(0);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('does not create board when canonical already exists', async () => {
    vi.mocked(assertSuperadminOpsTenantExists).mockResolvedValue({
      ok: true,
      tenantId: '1f1a0f0a-0000-4000-8000-000000000001',
      slug: 'superadmin-ops',
      status: 'active',
    });

    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const client = {
      query,
      release: vi.fn(),
    };
    vi.mocked(pool.connect).mockResolvedValue(client as never);

    vi.mocked(findCanonicalOpsBoardIdByName).mockResolvedValue('existing-board-id');

    const result = await ensureSuperadminOpsKanbanSeed('actor-1', { backfillLeads: false });
    expect(result.ok).toBe(true);
    expect(result.boardsCreated).toBe(0);
    expect(result.boards).toHaveLength(5);
    const insertBoardCalls = query.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO chat_kanban_boards'),
    );
    expect(insertBoardCalls).toHaveLength(0);
  });
});
