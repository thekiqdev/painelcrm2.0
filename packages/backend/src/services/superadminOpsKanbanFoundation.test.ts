import { describe, expect, it } from 'vitest';
import {
  OPS_KANBAN_CANONICAL_BOARD_NAMES,
  OPS_KANBAN_SEED_ADVISORY_LOCK_KEY,
  normalizeOpsBoardName,
} from './superadminOpsKanbanFoundation.js';
import { SUPERADMIN_OPS_KANBAN_BOARD_SEEDS } from './superadminOpsKanbanSeedService.js';

describe('superadminOpsKanbanFoundation', () => {
  it('canonical board names match seed definitions', () => {
    const seedNames = SUPERADMIN_OPS_KANBAN_BOARD_SEEDS.map((b) => b.name);
    expect([...OPS_KANBAN_CANONICAL_BOARD_NAMES]).toEqual(seedNames);
  });

  it('normalizes board names for comparison', () => {
    expect(normalizeOpsBoardName('  Aquisição  ')).toBe('aquisição');
    expect(normalizeOpsBoardName('Recovery')).toBe('recovery');
  });

  it('uses stable advisory lock key', () => {
    expect(OPS_KANBAN_SEED_ADVISORY_LOCK_KEY).toBe(0x1f1a0f0a);
  });
});
