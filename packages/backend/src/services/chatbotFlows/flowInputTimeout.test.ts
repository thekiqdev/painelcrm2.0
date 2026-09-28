import { describe, expect, it } from 'vitest';
import {
  processInboundStep,
  type RuntimeGraph,
} from './flowRuntimeEngine.js';

function graphWaitTimeout(): RuntimeGraph {
  return {
    nodes: [
      { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
      {
        id: 'q',
        type: 'wait_input',
        data: {
          prompt: 'Nome?',
          variable: 'name',
          timeout_enabled: true,
          timeout_amount: 1,
          timeout_unit: 'seconds',
        },
      },
      { id: 'ok', type: 'send_message', data: { text: 'recebeu {{name}}' } },
      { id: 'to', type: 'send_message', data: { text: 'timeout' } },
      { id: 'end', type: 'end', data: {} },
    ],
    edges: [
      { id: 'e0', source: 'start', target: 'q', sourceHandle: 'default' },
      { id: 'e1', source: 'q', target: 'ok', sourceHandle: 'default' },
      { id: 'e2', source: 'q', target: 'to', sourceHandle: 'timeout' },
      { id: 'e3', source: 'ok', target: 'end', sourceHandle: 'default' },
      { id: 'e4', source: 'to', target: 'end', sourceHandle: 'default' },
    ],
  };
}

describe('S18 input timeout', () => {
  it('wait_input agenda resumeAt quando timeout_enabled', () => {
    const g = graphWaitTimeout();
    const r = processInboundStep({
      graph: g,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: {},
        waitingVariable: null,
      },
      messageBody: 'oi',
      justStarted: true,
    });
    expect(r.session.status).toBe('waiting_input');
    expect(r.session.resumeAt).toBeTruthy();
  });

  it('resposta cancela timeout e segue default', () => {
    const g = graphWaitTimeout();
    const r1 = processInboundStep({
      graph: g,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: {},
        waitingVariable: null,
      },
      messageBody: 'oi',
      justStarted: true,
    });
    const r2 = processInboundStep({
      graph: g,
      session: r1.session,
      messageBody: 'Ana',
    });
    expect(r2.session.resumeAt).toBeFalsy();
    expect(r2.actions.some((a) => a.type === 'send_text' && a.text === 'recebeu Ana')).toBe(true);
  });

  it('resumeFromTimeout segue handle timeout', () => {
    const g = graphWaitTimeout();
    const r1 = processInboundStep({
      graph: g,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: {},
        waitingVariable: null,
      },
      messageBody: 'oi',
      justStarted: true,
    });
    const r2 = processInboundStep({
      graph: g,
      session: r1.session,
      messageBody: null,
      resumeFromTimeout: true,
    });
    expect(r2.actions.some((a) => a.type === 'send_text' && a.text === 'timeout')).toBe(true);
    expect(r2.session.status).toBe('ended');
  });
});
