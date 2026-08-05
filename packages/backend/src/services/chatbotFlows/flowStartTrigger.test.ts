import { describe, expect, it } from 'vitest';
import {
  isGroupExternalChatId,
  isStartDmOnly,
  matchFirstMessageTrigger,
  matchKeywordBody,
  matchStartTrigger,
  resolveKeywordList,
} from './flowStartTrigger.js';
import { matchFlowTrigger, type RuntimeGraph } from './flowRuntimeEngine.js';

describe('flowStartTrigger S22', () => {
  it('resolveKeywordList split | e array', () => {
    expect(resolveKeywordList({ type: 'keyword', value: 'oi | Olá |MENU' })).toEqual([
      'oi',
      'olá',
      'menu',
    ]);
    expect(
      resolveKeywordList({ type: 'keyword', value: 'x', keywords: ['A', ' b '] })
    ).toEqual(['a', 'b']);
  });

  it('matchKeywordBody contains vs equals', () => {
    expect(
      matchKeywordBody('oi tudo bem', { type: 'keyword', value: 'oi', match: 'contains' })
    ).toBe(true);
    expect(
      matchKeywordBody('oi tudo bem', { type: 'keyword', value: 'oi', match: 'equals' })
    ).toBe(false);
    expect(
      matchKeywordBody('oi', { type: 'keyword', value: 'oi', match: 'equals' })
    ).toBe(true);
    expect(
      matchKeywordBody('olá pessoal', { type: 'keyword', value: 'oi|olá', match: 'contains' })
    ).toBe(true);
  });

  it('first_message idle', () => {
    expect(
      matchFirstMessageTrigger(
        { type: 'first_message', idle_after_hours: 24 },
        { incomingMessageCount: 1 }
      )
    ).toBe(true);
    expect(
      matchFirstMessageTrigger(
        { type: 'first_message', idle_after_hours: 24 },
        { incomingMessageCount: 5, hoursSincePreviousIncoming: 2 }
      )
    ).toBe(false);
    expect(
      matchFirstMessageTrigger(
        { type: 'first_message', idle_after_hours: 24 },
        { incomingMessageCount: 5, hoursSincePreviousIncoming: 30 }
      )
    ).toBe(true);
    expect(
      matchFirstMessageTrigger(
        { type: 'first_message' },
        { incomingMessageCount: 5, hoursSincePreviousIncoming: 100 }
      )
    ).toBe(false);
  });

  it('dm_only e grupo', () => {
    expect(isStartDmOnly(undefined)).toBe(false);
    expect(isStartDmOnly({})).toBe(false);
    expect(isStartDmOnly({ dm_only: true })).toBe(true);
    expect(isGroupExternalChatId('120@g.us')).toBe(true);
    expect(isGroupExternalChatId('5511@s.whatsapp.net')).toBe(false);
  });

  it('matchFlowTrigger integra keyword multi + idle', () => {
    const gKw: RuntimeGraph = {
      nodes: [
        {
          id: 'start',
          type: 'start',
          data: { trigger: { type: 'keyword', value: 'teste1|kaique', match: 'equals' } },
        },
      ],
      edges: [],
    };
    expect(
      matchFlowTrigger({ graph: gKw, messageBody: 'teste1', incomingMessageCount: 9 })
    ).toBe('keyword');
    expect(
      matchFlowTrigger({ graph: gKw, messageBody: 'fala teste1', incomingMessageCount: 9 })
    ).toBeNull();

    const gIdle: RuntimeGraph = {
      nodes: [
        {
          id: 'start',
          type: 'start',
          data: { trigger: { type: 'first_message', idle_after_hours: 12 }, dm_only: true },
        },
      ],
      edges: [],
    };
    expect(
      matchFlowTrigger({
        graph: gIdle,
        messageBody: 'oi',
        incomingMessageCount: 3,
        hoursSincePreviousIncoming: 13,
      })
    ).toBe('first_message');
  });

  it('getStartSessionPolicy', async () => {
    const { getStartSessionPolicy } = await import('./flowStartTrigger.js');
    expect(getStartSessionPolicy(undefined)).toBe('ignore_if_session_alive');
    expect(getStartSessionPolicy({ session_policy: 'restart_on_keyword' })).toBe(
      'restart_on_keyword'
    );
  });
});
