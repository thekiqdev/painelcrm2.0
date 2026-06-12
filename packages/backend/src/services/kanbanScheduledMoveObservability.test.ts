import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  logKanbanScheduledMoveCancelled,
  logKanbanScheduledMoveCrossBoard,
  logKanbanScheduledMoveExecuted,
  logKanbanScheduledMoveFailed,
  logKanbanScheduledMoveScheduled,
  logKanbanScheduledMoveSkipped,
  normalizeCancelReasonForLog,
  normalizeSkipReasonForLog,
  scheduledMoveCorrelationId,
} from './kanbanScheduledMoveObservability.js';

const CARD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MOVE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LEAD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONV_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOARD_A = '11111111-1111-4111-8111-111111111111';
const BOARD_B = '22222222-2222-4222-8222-222222222222';
const COL_WS = '33333333-3333-4333-8333-333333333333';
const COL_TRIAL = '44444444-4444-4444-8444-444444444444';
const COL_D2 = '55555555-5555-4555-8555-555555555555';
const COL_D4 = '66666666-6666-4666-8666-666666666666';
const COL_D6 = '77777777-7777-4777-8777-777777777777';

describe('kanbanScheduledMoveObservability', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function lastLogPayload(): Record<string, unknown> {
    const calls = vi.mocked(console.info).mock.calls;
    const last = calls[calls.length - 1];
    expect(last[0]).toBe('[kanbanScheduledMove]');
    return last[1] as Record<string, unknown>;
  }

  it('correlationId deriva de scheduledMoveId', () => {
    expect(scheduledMoveCorrelationId(MOVE_ID)).toBe(`scheduled-move:${MOVE_ID}`);
  });

  describe('Parte 1 — agendamento', () => {
    it('mesmo board A → B', () => {
      logKanbanScheduledMoveScheduled({
        scheduledMoveId: MOVE_ID,
        cardId: CARD_ID,
        acquisitionLeadId: LEAD_ID,
        fromBoard: BOARD_A,
        fromColumn: COL_WS,
        toBoard: BOARD_A,
        toColumn: COL_D2,
        delayValue: 60,
        delayUnit: 'minutes',
        executeAt: '2026-05-24T12:00:00.000Z',
      });
      const p = lastLogPayload();
      expect(p.action).toBe('scheduled');
      expect(p.scheduledMoveId).toBe(MOVE_ID);
      expect(p.cardId).toBe(CARD_ID);
      expect(p.acquisitionLeadId).toBe(LEAD_ID);
      expect(p.fromBoard).toBe(BOARD_A);
      expect(p.fromColumn).toBe(COL_WS);
      expect(p.toBoard).toBe(BOARD_A);
      expect(p.toColumn).toBe(COL_D2);
      expect(p.delayValue).toBe(60);
      expect(p.delayUnit).toBe('minutes');
      expect(p.executeAt).toBe('2026-05-24T12:00:00.000Z');
      expect(p.correlationId).toBe(`scheduled-move:${MOVE_ID}`);
    });

    it('cross-board Aquisição Workspace Criado → Engajamento Trial Novo Trial', () => {
      logKanbanScheduledMoveScheduled({
        scheduledMoveId: MOVE_ID,
        cardId: CARD_ID,
        acquisitionLeadId: LEAD_ID,
        fromBoard: BOARD_A,
        fromColumn: COL_WS,
        toBoard: BOARD_B,
        toColumn: COL_TRIAL,
        delayValue: 1,
        delayUnit: 'hours',
        executeAt: new Date('2026-05-24T13:00:00.000Z'),
      });
      const p = lastLogPayload();
      expect(p.action).toBe('scheduled');
      expect(p.fromBoard).toBe(BOARD_A);
      expect(p.toBoard).toBe(BOARD_B);
      expect(p.fromColumn).toBe(COL_WS);
      expect(p.toColumn).toBe(COL_TRIAL);
    });
  });

  describe('Parte 2 — execução', () => {
    it('registra executed com correlationId', () => {
      logKanbanScheduledMoveExecuted({
        scheduledMoveId: MOVE_ID,
        cardId: CARD_ID,
        conversationId: CONV_ID,
        fromBoard: BOARD_A,
        fromColumn: COL_WS,
        toBoard: BOARD_B,
        toColumn: COL_TRIAL,
        executedAt: '2026-05-24T14:00:00.000Z',
      });
      const p = lastLogPayload();
      expect(p.action).toBe('executed');
      expect(p.conversationId).toBe(CONV_ID);
      expect(p.executedAt).toBe('2026-05-24T14:00:00.000Z');
      expect(p.correlationId).toBe(`scheduled-move:${MOVE_ID}`);
    });
  });

  describe('Parte 3 — cancelamento', () => {
    it('card_left_source_column', () => {
      logKanbanScheduledMoveCancelled({
        scheduledMoveId: MOVE_ID,
        cardId: CARD_ID,
        reason: 'card_left_source_column',
      });
      expect(lastLogPayload().action).toBe('cancelled');
      expect(lastLogPayload().reason).toBe('card_left_source_column');
    });

    it('manual_move após movimento manual', () => {
      logKanbanScheduledMoveCancelled({
        scheduledMoveId: MOVE_ID,
        cardId: CARD_ID,
        reason: 'superseded_after_auto_move_into_column',
      });
      expect(lastLogPayload().reason).toBe('manual_move');
    });

    it('card_deleted', () => {
      expect(normalizeCancelReasonForLog('card_deleted')).toBe('card_deleted');
    });
  });

  describe('Parte 4 — skip', () => {
    it('source_column_changed', () => {
      logKanbanScheduledMoveSkipped({
        scheduledMoveId: MOVE_ID,
        cardId: CARD_ID,
        acquisitionLeadId: LEAD_ID,
        reason: normalizeSkipReasonForLog('card_not_in_source_column'),
        internalReason: 'card_not_in_source_column',
      });
      const p = lastLogPayload();
      expect(p.action).toBe('skipped');
      expect(p.reason).toBe('source_column_changed');
      expect(p.internalReason).toBe('card_not_in_source_column');
    });

    it('acquisition_lead_already_on_destination_board', () => {
      logKanbanScheduledMoveSkipped({
        scheduledMoveId: MOVE_ID,
        cardId: CARD_ID,
        acquisitionLeadId: LEAD_ID,
        reason: normalizeSkipReasonForLog('acquisition_lead_already_on_destination_board'),
      });
      expect(lastLogPayload().reason).toBe('acquisition_lead_already_on_destination_board');
    });

    it('configuration_disabled', () => {
      expect(normalizeSkipReasonForLog('automation_config_changed_or_disabled')).toBe(
        'configuration_disabled',
      );
    });
  });

  describe('Parte 5 — falha', () => {
    it('captura error e stack', () => {
      const err = new Error('worker boom');
      logKanbanScheduledMoveFailed({
        scheduledMoveId: MOVE_ID,
        cardId: CARD_ID,
        acquisitionLeadId: LEAD_ID,
        conversationId: CONV_ID,
        error: err,
      });
      const p = lastLogPayload();
      expect(p.action).toBe('failed');
      expect(p.error).toBe('worker boom');
      expect(p.stack).toContain('worker boom');
    });
  });

  describe('Parte 7 — cross_board_move', () => {
    it('registra movimento entre quadros', () => {
      logKanbanScheduledMoveCrossBoard({
        scheduledMoveId: MOVE_ID,
        cardId: CARD_ID,
        acquisitionLeadId: LEAD_ID,
        fromBoard: BOARD_A,
        toBoard: BOARD_B,
        fromColumn: COL_WS,
        toColumn: COL_TRIAL,
      });
      const p = lastLogPayload();
      expect(p.action).toBe('cross_board_move');
      expect(p.fromBoard).toBe(BOARD_A);
      expect(p.toBoard).toBe(BOARD_B);
      expect(p.correlationId).toBe(`scheduled-move:${MOVE_ID}`);
    });
  });

  describe('Parte 8 — cadeia de movimentos', () => {
    it('simula logs encadeados Workspace Criado → Novo Trial → Dia 2 → Dia 4 → Dia 6', () => {
      const chain = [
        { from: COL_WS, to: COL_TRIAL, board: BOARD_B },
        { from: COL_TRIAL, to: COL_D2, board: BOARD_B },
        { from: COL_D2, to: COL_D4, board: BOARD_B },
        { from: COL_D4, to: COL_D6, board: BOARD_B },
      ];
      const correlationId = scheduledMoveCorrelationId(MOVE_ID);

      for (const hop of chain) {
        logKanbanScheduledMoveScheduled({
          correlationId,
          scheduledMoveId: MOVE_ID,
          cardId: CARD_ID,
          acquisitionLeadId: LEAD_ID,
          fromBoard: BOARD_A,
          fromColumn: hop.from,
          toBoard: hop.board,
          toColumn: hop.to,
          delayValue: 1,
          delayUnit: 'days',
          executeAt: new Date().toISOString(),
        });
        logKanbanScheduledMoveExecuted({
          correlationId,
          scheduledMoveId: MOVE_ID,
          cardId: CARD_ID,
          acquisitionLeadId: LEAD_ID,
          fromBoard: BOARD_A,
          fromColumn: hop.from,
          toBoard: hop.board,
          toColumn: hop.to,
          executedAt: new Date().toISOString(),
        });
      }

      expect(vi.mocked(console.info).mock.calls.length).toBe(chain.length * 2);
      const lastExecuted = vi.mocked(console.info).mock.calls.at(-1)?.[1] as Record<string, unknown>;
      expect(lastExecuted.action).toBe('executed');
      expect(lastExecuted.toColumn).toBe(COL_D6);
      expect(lastExecuted.correlationId).toBe(correlationId);
    });
  });
});
