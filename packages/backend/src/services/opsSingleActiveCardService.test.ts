import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  pickWinnerOpsCard,
  type ActiveOpsCardRow,
} from './opsSingleActiveCardService.js';

function card(
  id: string,
  opts?: Partial<ActiveOpsCardRow>,
): ActiveOpsCardRow {
  return {
    cardId: id,
    boardId: 'board-1',
    columnId: 'col-1',
    columnName: 'Col',
    updatedAt: new Date('2026-06-01T10:00:00Z'),
    createdAt: new Date('2026-06-01T09:00:00Z'),
    scheduledMoveCount: 0,
    ...opts,
  };
}

describe('opsSingleActiveCardService', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  describe('pickWinnerOpsCard', () => {
    it('prefere card com scheduled moves', () => {
      const winner = pickWinnerOpsCard([
        card('phantom', { updatedAt: new Date('2026-06-12T10:00:00Z') }),
        card('active', {
          scheduledMoveCount: 1,
          updatedAt: new Date('2026-06-01T10:00:00Z'),
        }),
      ]);
      expect(winner?.cardId).toBe('active');
    });

    it('prefere updated_at mais recente sem agendamentos', () => {
      const winner = pickWinnerOpsCard([
        card('older', { updatedAt: new Date('2026-06-01T10:00:00Z') }),
        card('newer', { updatedAt: new Date('2026-06-12T10:00:00Z') }),
      ]);
      expect(winner?.cardId).toBe('newer');
    });

    it('retorna null para lista vazia', () => {
      expect(pickWinnerOpsCard([])).toBeNull();
    });
  });
});
