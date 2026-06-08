import { describe, expect, it } from 'vitest';
import { SUPERADMIN_OPS_KANBAN_BOARD_SEEDS } from './superadminOpsKanbanSeedService.js';

describe('SUPERADMIN_OPS_KANBAN_BOARD_SEEDS', () => {
  it('defines five operational boards', () => {
    expect(SUPERADMIN_OPS_KANBAN_BOARD_SEEDS).toHaveLength(5);
    const names = SUPERADMIN_OPS_KANBAN_BOARD_SEEDS.map((b) => b.name);
    expect(names).toContain('Aquisição');
    expect(names).toContain('Recovery');
    expect(names).toContain('Onboarding');
    expect(names).toContain('Expansão');
    expect(names).toContain('Reativação');
  });

  it('acquisition board has full lifecycle columns', () => {
    const acq = SUPERADMIN_OPS_KANBAN_BOARD_SEEDS.find((b) => b.name === 'Aquisição');
    expect(acq?.columns.map((c) => c.name)).toEqual([
      'Novo lead',
      'Qualificado',
      'Iniciou cadastro',
      'Checkout',
      'Checkout abandonado',
      'Trial iniciado',
      'Onboarding incompleto',
      'Ativado',
      'Perdido',
    ]);
  });
});
