import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  pickWinnerOpsCard,
  withOpsLeadCardSessionLock,
  type ActiveOpsCardRow,
} from './opsSingleActiveCardService.js';

const poolConnectMock = vi.hoisted(() => vi.fn());
const poolQueryMock = vi.hoisted(() => vi.fn());

vi.mock('../utils/db.js', () => ({
  pool: {
    connect: poolConnectMock,
    query: vi.fn(),
  },
}));

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
    poolConnectMock.mockReset();
    poolQueryMock.mockReset();
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

  describe('withOpsLeadCardSessionLock', () => {
    it('adquire lock, executa fn e libera com logs', async () => {
      const release = vi.fn();
      const clientQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ ok: true }] })
        .mockResolvedValueOnce({ rows: [] });
      poolConnectMock.mockResolvedValue({ query: clientQuery, release });

      const result = await withOpsLeadCardSessionLock(
        'lead-1',
        async () => 'done',
        { correlationId: 'corr-1' },
      );

      expect(result).toBe('done');
      expect(clientQuery).toHaveBeenCalledTimes(2);
      expect(release).toHaveBeenCalled();
      const logs = vi.mocked(console.info).mock.calls.map((c) => c[1]);
      expect(logs).toContainEqual(
        expect.objectContaining({ action: 'lock_acquired', acquisitionLeadId: 'lead-1' }),
      );
      expect(logs).toContainEqual(
        expect.objectContaining({ action: 'lock_released', acquisitionLeadId: 'lead-1' }),
      );
    });

    it('falha com timeout quando lock não é adquirido', async () => {
      vi.useFakeTimers();
      const release = vi.fn();
      const clientQuery = vi.fn().mockResolvedValue({ rows: [{ ok: false }] });
      poolConnectMock.mockResolvedValue({ query: clientQuery, release });

      const promise = withOpsLeadCardSessionLock(
        'lead-2',
        async () => 'done',
        { lockWaitMs: 100 },
      );
      const expectation = expect(promise).rejects.toThrow('ops_lead_card_lock_timeout:lead-2');
      await vi.advanceTimersByTimeAsync(150);
      await expectation;
      expect(release).toHaveBeenCalled();
      const logs = vi.mocked(console.info).mock.calls.map((c) => c[1]);
      expect(logs).toContainEqual(
        expect.objectContaining({ action: 'lock_wait_timeout', acquisitionLeadId: 'lead-2' }),
      );
      vi.useRealTimers();
    });
  });
});
