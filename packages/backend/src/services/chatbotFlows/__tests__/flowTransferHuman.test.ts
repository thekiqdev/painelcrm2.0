import { describe, expect, it } from 'vitest';
import { nextAttendanceAfterTransferHuman } from '../flowCrmActions.js';

describe('nextAttendanceAfterTransferHuman', () => {
  it('mantém in_progress quando já há agente atrelado', () => {
    expect(
      nextAttendanceAfterTransferHuman({
        currentStatus: 'pending',
        assignedToUserId: 'agent-1',
      })
    ).toBe('in_progress');
    expect(
      nextAttendanceAfterTransferHuman({
        currentStatus: 'in_progress',
        assignedToUserId: 'agent-1',
      })
    ).toBe('in_progress');
  });

  it('vai para pending na fila geral sem agente', () => {
    expect(
      nextAttendanceAfterTransferHuman({
        currentStatus: 'open',
        assignedToUserId: null,
      })
    ).toBe('pending');
  });

  it('não reabre closed/archived', () => {
    expect(
      nextAttendanceAfterTransferHuman({
        currentStatus: 'closed',
        assignedToUserId: 'agent-1',
      })
    ).toBe('closed');
    expect(
      nextAttendanceAfterTransferHuman({
        currentStatus: 'archived',
        assignedToUserId: null,
      })
    ).toBe('archived');
  });
});
