import { describe, expect, it } from 'vitest';
import {
  isGlobalOptOutWord,
  isGroupExternalChatId,
  isStartDmOnly,
  matchFirstMessageTrigger,
  matchKanbanColumnTrigger,
  matchKeywordBody,
  matchStartTrigger,
  matchTagTrigger,
  resolveKeywordList,
} from './flowStartTrigger.js';
import {
  matchFlowCrmEventTrigger,
  matchFlowTrigger,
  type RuntimeGraph,
} from './flowRuntimeEngine.js';

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

describe('flowStartTrigger S31', () => {
  it('isGlobalOptOutWord equals parar/sair', () => {
    expect(isGlobalOptOutWord('parar')).toBe(true);
    expect(isGlobalOptOutWord(' SAIR ')).toBe(true);
    expect(isGlobalOptOutWord('Parar')).toBe(true);
    expect(isGlobalOptOutWord('quero parar')).toBe(false);
    expect(isGlobalOptOutWord('parar agora')).toBe(false);
    expect(isGlobalOptOutWord('')).toBe(false);
  });

  it('matchTagTrigger por id ou label', () => {
    expect(
      matchTagTrigger(
        { type: 'tag', tag_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        { tagId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', tagLabel: 'x' }
      )
    ).toBe(true);
    expect(
      matchTagTrigger(
        { type: 'tag', tag_label: 'Lead-Quente' },
        { tagId: 'other', tagLabel: 'lead-quente' }
      )
    ).toBe(true);
    expect(
      matchTagTrigger({ type: 'tag', tag_label: 'a' }, { tagId: null, tagLabel: 'b' })
    ).toBe(false);
    expect(matchTagTrigger({ type: 'tag' }, { tagId: 'x', tagLabel: 'y' })).toBe(false);
  });

  it('matchKanbanColumnTrigger com board opcional', () => {
    const col = '11111111-1111-1111-1111-111111111111';
    const board = '22222222-2222-2222-2222-222222222222';
    expect(
      matchKanbanColumnTrigger(
        { type: 'kanban_column', column_id: col },
        { columnId: col, boardId: board }
      )
    ).toBe(true);
    expect(
      matchKanbanColumnTrigger(
        { type: 'kanban_column', column_id: col, board_id: board },
        { columnId: col, boardId: board }
      )
    ).toBe(true);
    expect(
      matchKanbanColumnTrigger(
        { type: 'kanban_column', column_id: col, board_id: board },
        { columnId: col, boardId: '33333333-3333-3333-3333-333333333333' }
      )
    ).toBe(false);
    expect(
      matchKanbanColumnTrigger(
        { type: 'kanban_column', column_id: col },
        { columnId: '33333333-3333-3333-3333-333333333333' }
      )
    ).toBe(false);
  });

  it('matchStartTrigger ignora tag/kanban no inbound de mensagem', () => {
    expect(
      matchStartTrigger({
        trigger: { type: 'tag', tag_label: 'x' },
        messageBody: 'oi',
        incomingMessageCount: 1,
      })
    ).toBeNull();
    expect(
      matchStartTrigger({
        trigger: {
          type: 'kanban_column',
          column_id: '11111111-1111-1111-1111-111111111111',
        },
        messageBody: 'oi',
        incomingMessageCount: 1,
      })
    ).toBeNull();
  });

  it('matchFlowCrmEventTrigger integra tag e coluna', () => {
    const tagId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const colId = '11111111-1111-1111-1111-111111111111';
    const gTag: RuntimeGraph = {
      nodes: [{ id: 'start', type: 'start', data: { trigger: { type: 'tag', tag_id: tagId } } }],
      edges: [],
    };
    const gCol: RuntimeGraph = {
      nodes: [
        {
          id: 'start',
          type: 'start',
          data: { trigger: { type: 'kanban_column', column_id: colId } },
        },
      ],
      edges: [],
    };
    expect(
      matchFlowCrmEventTrigger({
        graph: gTag,
        event: { kind: 'tag', tagId, tagLabel: 'Lead' },
      })
    ).toBe('tag');
    expect(
      matchFlowCrmEventTrigger({
        graph: gTag,
        event: { kind: 'tag', tagId: 'other', tagLabel: 'x' },
      })
    ).toBeNull();
    expect(
      matchFlowCrmEventTrigger({
        graph: gCol,
        event: { kind: 'kanban_column', columnId: colId },
      })
    ).toBe('kanban_column');
    expect(
      matchFlowCrmEventTrigger({
        graph: gCol,
        event: { kind: 'tag', tagId, tagLabel: 'x' },
      })
    ).toBeNull();
  });
});
