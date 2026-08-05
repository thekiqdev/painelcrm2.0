import { describe, expect, it } from 'vitest';
import {
  interpolateTemplate,
  matchFlowTrigger,
  processInboundStep,
  type RuntimeGraph,
  type RuntimeSessionSnapshot,
} from './flowRuntimeEngine.js';

function graphWelcome(): RuntimeGraph {
  return {
    nodes: [
      {
        id: 'start',
        type: 'start',
        data: { trigger: { type: 'keyword', value: 'oi' } },
      },
      { id: 'm1', type: 'send_message', data: { text: 'Olá!' } },
      { id: 'q1', type: 'wait_input', data: { prompt: 'Seu nome?', variable: 'name' } },
      { id: 'm2', type: 'send_message', data: { text: 'Bem-vindo, {{name}}' } },
      {
        id: 'c1',
        type: 'condition',
        data: {
          cases: [
            {
              id: 'vip',
              name: 'VIP',
              join: 'and',
              conditions: [{ variable: 'name', operator: 'eq', value: 'vip' }],
            },
          ],
        },
      },
      { id: 'h1', type: 'transfer_human', data: { message: 'Humano' } },
      { id: 'e1', type: 'end', data: {} },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'm1', sourceHandle: 'default' },
      { id: 'e2', source: 'm1', target: 'q1', sourceHandle: 'default' },
      { id: 'e3', source: 'q1', target: 'm2', sourceHandle: 'default' },
      { id: 'e4', source: 'm2', target: 'c1', sourceHandle: 'default' },
      { id: 'e5', source: 'c1', target: 'h1', sourceHandle: 'case:vip' },
      { id: 'e6', source: 'c1', target: 'e1', sourceHandle: 'else' },
    ],
  };
}

function graphMultiCase(): RuntimeGraph {
  return {
    nodes: [
      { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
      {
        id: 'c',
        type: 'condition',
        data: {
          cases: [
            {
              id: 'a',
              name: 'A',
              join: 'and',
              conditions: [{ variable: 'x', operator: 'eq', value: '1' }],
            },
            {
              id: 'b',
              name: 'B',
              join: 'and',
              conditions: [{ variable: 'x', operator: 'eq', value: '2' }],
            },
            {
              id: 'c3',
              name: 'C',
              join: 'and',
              conditions: [{ variable: 'x', operator: 'contains', value: 'z' }],
            },
          ],
        },
      },
      { id: 'ma', type: 'send_message', data: { text: 'caso-a' } },
      { id: 'mb', type: 'send_message', data: { text: 'caso-b' } },
      { id: 'mc', type: 'send_message', data: { text: 'caso-c' } },
      { id: 'me', type: 'send_message', data: { text: 'else' } },
      { id: 'end', type: 'end', data: {} },
    ],
    edges: [
      { id: 'e0', source: 'start', target: 'c', sourceHandle: 'default' },
      { id: 'ea', source: 'c', target: 'ma', sourceHandle: 'case:a' },
      { id: 'eb', source: 'c', target: 'mb', sourceHandle: 'case:b' },
      { id: 'ec', source: 'c', target: 'mc', sourceHandle: 'case:c3' },
      { id: 'ee', source: 'c', target: 'me', sourceHandle: 'else' },
      { id: 'xa', source: 'ma', target: 'end', sourceHandle: 'default' },
      { id: 'xb', source: 'mb', target: 'end', sourceHandle: 'default' },
      { id: 'xc', source: 'mc', target: 'end', sourceHandle: 'default' },
      { id: 'xe', source: 'me', target: 'end', sourceHandle: 'default' },
    ],
  };
}

describe('flowRuntimeEngine', () => {
  it('interpolateTemplate substitui variáveis', () => {
    expect(interpolateTemplate('Oi {{ name }}!', { name: 'Ana' })).toBe('Oi Ana!');
  });

  it('matchFlowTrigger keyword', () => {
    const g = graphWelcome();
    expect(
      matchFlowTrigger({ graph: g, messageBody: 'oi', incomingMessageCount: 5 })
    ).toBe('keyword');
    expect(
      matchFlowTrigger({ graph: g, messageBody: 'olá', incomingMessageCount: 5 })
    ).toBeNull();
  });

  it('keyword → mensagem → wait_input', () => {
    const g = graphWelcome();
    const session: RuntimeSessionSnapshot = {
      status: 'active',
      currentNodeId: null,
      variables: {},
      waitingVariable: null,
    };
    const r = processInboundStep({
      graph: g,
      session,
      messageBody: 'oi',
      justStarted: true,
    });
    expect(r.handled).toBe(true);
    expect(r.session.status).toBe('waiting_input');
    expect(r.session.waitingVariable).toBe('name');
    expect(r.actions.filter((a) => a.type === 'send_text').map((a) => (a as { text: string }).text)).toEqual([
      'Olá!',
      'Seu nome?',
    ]);
  });

  it('wait_input → condição false → end', () => {
    const g = graphWelcome();
    const session: RuntimeSessionSnapshot = {
      status: 'waiting_input',
      currentNodeId: 'q1',
      variables: {},
      waitingVariable: 'name',
    };
    const r = processInboundStep({
      graph: g,
      session,
      messageBody: 'João',
    });
    expect(r.session.variables.name).toBe('João');
    expect(r.session.status).toBe('ended');
    const texts = r.actions
      .filter((a) => a.type === 'send_text')
      .map((a) => (a as { text: string }).text);
    expect(texts).toContain('Bem-vindo, João');
    expect(r.actions.some((a) => a.type === 'end')).toBe(true);
  });

  it('wait_input → condição true → transfer_human', () => {
    const g = graphWelcome();
    const session: RuntimeSessionSnapshot = {
      status: 'waiting_input',
      currentNodeId: 'q1',
      variables: {},
      waitingVariable: 'name',
    };
    const r = processInboundStep({
      graph: g,
      session,
      messageBody: 'vip',
    });
    expect(r.session.status).toBe('transferred');
    expect(r.actions.some((a) => a.type === 'transfer_human')).toBe(true);
  });

  it('first_message só na 1ª', () => {
    const g: RuntimeGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
        { id: 'e1', type: 'end', data: {} },
      ],
      edges: [{ id: 'x', source: 'start', target: 'e1', sourceHandle: 'default' }],
    };
    expect(
      matchFlowTrigger({ graph: g, messageBody: 'x', incomingMessageCount: 1 })
    ).toBe('first_message');
    expect(
      matchFlowTrigger({ graph: g, messageBody: 'x', incomingMessageCount: 2 })
    ).toBeNull();
  });

  it('set_variable + interpolação em send_message', () => {
    const g: RuntimeGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
        { id: 'sv', type: 'set_variable', data: { variable: 'city', value: 'SP' } },
        { id: 'm', type: 'send_message', data: { text: 'Cidade {{city}}' } },
        { id: 'e1', type: 'end', data: {} },
      ],
      edges: [
        { id: 'a', source: 'start', target: 'sv', sourceHandle: 'default' },
        { id: 'b', source: 'sv', target: 'm', sourceHandle: 'default' },
        { id: 'c', source: 'm', target: 'e1', sourceHandle: 'default' },
      ],
    };
    const r = processInboundStep({
      graph: g,
      session: { status: 'active', currentNodeId: null, variables: {}, waitingVariable: null },
      messageBody: 'x',
      justStarted: true,
    });
    expect(r.session.variables.city).toBe('SP');
    expect(r.actions.some((a) => a.type === 'send_text' && a.text === 'Cidade SP')).toBe(true);
    expect(r.session.status).toBe('ended');
  });

  it('delay pausa e resumeFromDelay avança', () => {
    const g: RuntimeGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
        { id: 'd', type: 'delay', data: { amount: 1, unit: 'minutes' } },
        { id: 'm', type: 'send_message', data: { text: 'depois' } },
        { id: 'e1', type: 'end', data: {} },
      ],
      edges: [
        { id: 'a', source: 'start', target: 'd', sourceHandle: 'default' },
        { id: 'b', source: 'd', target: 'm', sourceHandle: 'default' },
        { id: 'c', source: 'm', target: 'e1', sourceHandle: 'default' },
      ],
    };
    const r1 = processInboundStep({
      graph: g,
      session: { status: 'active', currentNodeId: null, variables: {}, waitingVariable: null },
      messageBody: 'x',
      justStarted: true,
    });
    expect(r1.session.status).toBe('waiting_delay');
    expect(r1.actions.some((a) => a.type === 'delay')).toBe(true);

    const r2 = processInboundStep({
      graph: g,
      session: r1.session,
      messageBody: null,
      resumeFromDelay: true,
    });
    expect(r2.actions.some((a) => a.type === 'send_text' && a.text === 'depois')).toBe(true);
    expect(r2.session.status).toBe('ended');
  });

  it('http_request pausa e resumeFromHttp ok → default', () => {
    const g: RuntimeGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
        {
          id: 'h',
          type: 'http_request',
          data: {
            method: 'GET',
            url: 'https://example.com',
            response_variable: 'body',
            status_variable: 'status',
          },
        },
        { id: 'ok', type: 'send_message', data: { text: 'ok {{body}}' } },
        { id: 'err', type: 'send_message', data: { text: 'erro' } },
        { id: 'e1', type: 'end', data: {} },
        { id: 'e2', type: 'end', data: {} },
      ],
      edges: [
        { id: 'a', source: 'start', target: 'h', sourceHandle: 'default' },
        { id: 'b', source: 'h', target: 'ok', sourceHandle: 'default' },
        { id: 'c', source: 'h', target: 'err', sourceHandle: 'error' },
        { id: 'd', source: 'ok', target: 'e1', sourceHandle: 'default' },
        { id: 'e', source: 'err', target: 'e2', sourceHandle: 'default' },
      ],
    };
    const r1 = processInboundStep({
      graph: g,
      session: { status: 'active', currentNodeId: null, variables: {}, waitingVariable: null },
      messageBody: 'x',
      justStarted: true,
    });
    expect(r1.session.status).toBe('waiting_http');
    expect(r1.actions.some((a) => a.type === 'http_request')).toBe(true);

    const r2 = processInboundStep({
      graph: g,
      session: r1.session,
      messageBody: null,
      resumeFromHttp: { ok: true, mappedVariables: { body: '{"id":1}', status: '200' } },
    });
    expect(r2.session.variables.status).toBe('200');
    expect(r2.actions.some((a) => a.type === 'send_text' && String(a.text).includes('ok'))).toBe(
      true
    );
    expect(r2.session.status).toBe('ended');
  });

  it('http_request resumeFromHttp erro → error handle', () => {
    const g: RuntimeGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
        { id: 'h', type: 'http_request', data: { method: 'GET', url: 'https://example.com' } },
        { id: 'ok', type: 'send_message', data: { text: 'ok' } },
        { id: 'err', type: 'send_message', data: { text: 'falhou' } },
        { id: 'e1', type: 'end', data: {} },
        { id: 'e2', type: 'end', data: {} },
      ],
      edges: [
        { id: 'a', source: 'start', target: 'h', sourceHandle: 'default' },
        { id: 'b', source: 'h', target: 'ok', sourceHandle: 'default' },
        { id: 'c', source: 'h', target: 'err', sourceHandle: 'error' },
        { id: 'd', source: 'ok', target: 'e1', sourceHandle: 'default' },
        { id: 'e', source: 'err', target: 'e2', sourceHandle: 'default' },
      ],
    };
    const r1 = processInboundStep({
      graph: g,
      session: { status: 'active', currentNodeId: null, variables: {}, waitingVariable: null },
      messageBody: 'x',
      justStarted: true,
    });
    const r2 = processInboundStep({
      graph: g,
      session: r1.session,
      messageBody: null,
      resumeFromHttp: { ok: false },
    });
    expect(r2.actions.some((a) => a.type === 'send_text' && a.text === 'falhou')).toBe(true);
  });

  it('webhook_in startFromWebhook avança com variáveis', () => {
    const g: RuntimeGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
        { id: 'win', type: 'webhook_in', data: { token: 'abc12345678901234567' } },
        { id: 'm', type: 'send_message', data: { text: 'oi {{nome}}' } },
        { id: 'e1', type: 'end', data: {} },
      ],
      edges: [
        { id: 'a', source: 'win', target: 'm', sourceHandle: 'default' },
        { id: 'b', source: 'm', target: 'e1', sourceHandle: 'default' },
      ],
    };
    const r = processInboundStep({
      graph: g,
      session: { status: 'active', currentNodeId: null, variables: {}, waitingVariable: null },
      messageBody: null,
      startFromWebhook: { nodeId: 'win', variables: { nome: 'Ana' } },
    });
    expect(r.actions.some((a) => a.type === 'send_text' && a.text === 'oi Ana')).toBe(true);
    expect(r.session.status).toBe('ended');
  });

  it('conversation_note → resolve com mensagem encerra sessão', () => {
    const g: RuntimeGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
        { id: 'note', type: 'conversation_note', data: { text: 'CPF {{cpf}} ok' } },
        {
          id: 'res',
          type: 'resolve_conversation',
          data: { message: 'Até logo, {{name}}', close_attendance: true },
        },
      ],
      edges: [
        { id: 'a', source: 'start', target: 'note', sourceHandle: 'default' },
        { id: 'b', source: 'note', target: 'res', sourceHandle: 'default' },
      ],
    };
    const r = processInboundStep({
      graph: g,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: { cpf: '123', name: 'Ana' },
        waitingVariable: null,
      },
      messageBody: 'x',
      justStarted: true,
    });
    expect(r.handled).toBe(true);
    expect(r.session.status).toBe('ended');
    expect(
      r.actions.some((a) => a.type === 'conversation_note' && a.text === 'CPF 123 ok')
    ).toBe(true);
    expect(r.actions.some((a) => a.type === 'send_text' && a.text === 'Até logo, Ana')).toBe(true);
    expect(
      r.actions.some(
        (a) => a.type === 'resolve_conversation' && a.closeAttendance !== false
      )
    ).toBe(true);
  });

  it('move_kanban emite action e waiting_http (cria ou move)', () => {
    const g: RuntimeGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
        {
          id: 'k',
          type: 'move_kanban',
          data: {
            board_id: '11111111-1111-1111-1111-111111111111',
            column_id: '22222222-2222-2222-2222-222222222222',
            title: 'Lead {{name}}',
          },
        },
        { id: 'ok', type: 'send_message', data: { text: 'ok {{kanban.card_id}}' } },
        { id: 'err', type: 'send_message', data: { text: 'falhou' } },
        { id: 'e1', type: 'end', data: {} },
        { id: 'e2', type: 'end', data: {} },
      ],
      edges: [
        { id: 'a', source: 'start', target: 'k', sourceHandle: 'default' },
        { id: 'b', source: 'k', target: 'ok', sourceHandle: 'default' },
        { id: 'c', source: 'k', target: 'err', sourceHandle: 'error' },
        { id: 'd', source: 'ok', target: 'e1', sourceHandle: 'default' },
        { id: 'e', source: 'err', target: 'e2', sourceHandle: 'default' },
      ],
    };
    const r1 = processInboundStep({
      graph: g,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: { name: 'Ana' },
        waitingVariable: null,
      },
      messageBody: 'x',
      justStarted: true,
    });
    expect(r1.session.status).toBe('waiting_http');
    const act = r1.actions.find((a) => a.type === 'move_kanban');
    expect(act).toMatchObject({
      type: 'move_kanban',
      title: 'Lead Ana',
      columnId: '22222222-2222-2222-2222-222222222222',
    });

    const r2 = processInboundStep({
      graph: g,
      session: r1.session,
      messageBody: null,
      resumeFromHttp: {
        ok: true,
        mappedVariables: {
          'kanban.card_id': 'card-1',
          'kanban.board_id': '11111111-1111-1111-1111-111111111111',
          'kanban.column_id': '22222222-2222-2222-2222-222222222222',
          'kanban.created': 'false',
          'kanban.moved': 'true',
        },
      },
    });
    expect(r2.session.variables['kanban.card_id']).toBe('card-1');
    expect(r2.session.variables['kanban.moved']).toBe('true');
    expect(r2.actions.some((a) => a.type === 'send_text' && String(a.text).includes('ok'))).toBe(
      true
    );
  });

  it('kanban_add_card (legado) alias: emite action e waiting_http', () => {
    const g: RuntimeGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
        {
          id: 'k',
          type: 'kanban_add_card',
          data: {
            board_id: '11111111-1111-1111-1111-111111111111',
            column_id: '22222222-2222-2222-2222-222222222222',
            title: 'Lead {{name}}',
          },
        },
        { id: 'ok', type: 'send_message', data: { text: 'ok {{kanban.card_id}}' } },
        { id: 'err', type: 'send_message', data: { text: 'falhou' } },
        { id: 'e1', type: 'end', data: {} },
        { id: 'e2', type: 'end', data: {} },
      ],
      edges: [
        { id: 'a', source: 'start', target: 'k', sourceHandle: 'default' },
        { id: 'b', source: 'k', target: 'ok', sourceHandle: 'default' },
        { id: 'c', source: 'k', target: 'err', sourceHandle: 'error' },
        { id: 'd', source: 'ok', target: 'e1', sourceHandle: 'default' },
        { id: 'e', source: 'err', target: 'e2', sourceHandle: 'default' },
      ],
    };
    const r1 = processInboundStep({
      graph: g,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: { name: 'Ana' },
        waitingVariable: null,
      },
      messageBody: 'x',
      justStarted: true,
    });
    expect(r1.session.status).toBe('waiting_http');
    const act = r1.actions.find((a) => a.type === 'kanban_add_card');
    expect(act).toMatchObject({
      type: 'kanban_add_card',
      title: 'Lead Ana',
    });

    const r2 = processInboundStep({
      graph: g,
      session: r1.session,
      messageBody: null,
      resumeFromHttp: {
        ok: true,
        mappedVariables: {
          'kanban.card_id': 'card-1',
          'kanban.board_id': '11111111-1111-1111-1111-111111111111',
          'kanban.column_id': '22222222-2222-2222-2222-222222222222',
          'kanban.created': 'true',
        },
      },
    });
    expect(r2.session.variables['kanban.card_id']).toBe('card-1');
    expect(r2.actions.some((a) => a.type === 'send_text' && String(a.text).includes('ok'))).toBe(
      true
    );
  });

  it('condition multi-caso escolhe o case correto e else', () => {
    const g = graphMultiCase();
    const base = {
      status: 'active' as const,
      currentNodeId: null,
      waitingVariable: null,
    };

    const run = (x: string) =>
      processInboundStep({
        graph: g,
        session: { ...base, variables: { x } },
        messageBody: 'hi',
        justStarted: true,
      });

    expect(run('1').actions.some((a) => a.type === 'send_text' && a.text === 'caso-a')).toBe(true);
    expect(run('2').actions.some((a) => a.type === 'send_text' && a.text === 'caso-b')).toBe(true);
    expect(run('xyz').actions.some((a) => a.type === 'send_text' && a.text === 'caso-c')).toBe(true);
    expect(run('0').actions.some((a) => a.type === 'send_text' && a.text === 'else')).toBe(true);
  });

  it('condition legado true/false ainda funciona (compat)', () => {
    const g: RuntimeGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
        {
          id: 'c',
          type: 'condition',
          data: { variable: 'x', operator: 'eq', value: 'ok' },
        },
        { id: 'mt', type: 'send_message', data: { text: 'sim' } },
        { id: 'mf', type: 'send_message', data: { text: 'nao' } },
        { id: 'end', type: 'end', data: {} },
      ],
      edges: [
        { id: 'e0', source: 'start', target: 'c', sourceHandle: 'default' },
        { id: 'et', source: 'c', target: 'mt', sourceHandle: 'true' },
        { id: 'ef', source: 'c', target: 'mf', sourceHandle: 'false' },
        { id: 'xt', source: 'mt', target: 'end', sourceHandle: 'default' },
        { id: 'xf', source: 'mf', target: 'end', sourceHandle: 'default' },
      ],
    };
    const rOk = processInboundStep({
      graph: g,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: { x: 'ok' },
        waitingVariable: null,
      },
      messageBody: 'x',
      justStarted: true,
    });
    expect(rOk.actions.some((a) => a.type === 'send_text' && a.text === 'sim')).toBe(true);

    const rNo = processInboundStep({
      graph: g,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: { x: 'no' },
        waitingVariable: null,
      },
      messageBody: 'x',
      justStarted: true,
    });
    expect(rNo.actions.some((a) => a.type === 'send_text' && a.text === 'nao')).toBe(true);
  });
});
