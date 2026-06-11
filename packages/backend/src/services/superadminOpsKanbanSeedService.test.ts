import { describe, expect, it } from 'vitest';
import { SUPERADMIN_OPS_KANBAN_BOARD_SEEDS } from './superadminOpsKanbanSeedService.js';

describe('SUPERADMIN_OPS_KANBAN_BOARD_SEEDS', () => {
  it('defines six operational boards including Engajamento Trial', () => {
    expect(SUPERADMIN_OPS_KANBAN_BOARD_SEEDS).toHaveLength(6);
    const names = SUPERADMIN_OPS_KANBAN_BOARD_SEEDS.map((b) => b.name);
    expect(names).toEqual([
      'Aquisição',
      'Recovery',
      'Onboarding',
      'Expansão',
      'Reativação',
      'Engajamento Trial',
    ]);
  });

  it('engagement trial board has Sprint N1 lifecycle columns', () => {
    const engagement = SUPERADMIN_OPS_KANBAN_BOARD_SEEDS.find((b) => b.name === 'Engajamento Trial');
    expect(engagement?.sort_order).toBe(55);
    expect(engagement?.columns.map((c) => c.name)).toEqual([
      'Trial iniciado',
      'Dia 2',
      'Dia 4',
      'Dia 6',
      'Trial finalizando',
    ]);
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
