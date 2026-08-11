import { describe, expect, it } from 'vitest';
import { processInboundStep, type RuntimeGraph } from './flowRuntimeEngine.js';
import { sendMessageDataSchema } from './graphValidation.js';

describe('S19 send_message media', () => {
  it('emite send_media quando send_mode=media', () => {
    const g: RuntimeGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
        {
          id: 'm',
          type: 'send_message',
          data: {
            send_mode: 'media',
            media_type: 'image',
            media_url: 'https://cdn.example/{{slug}}.jpg',
            caption: 'Olá {{name}}',
          },
        },
        { id: 'end', type: 'end', data: {} },
      ],
      edges: [
        { id: 'a', source: 'start', target: 'm', sourceHandle: 'default' },
        { id: 'b', source: 'm', target: 'end', sourceHandle: 'default' },
      ],
    };
    const r = processInboundStep({
      graph: g,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: { slug: 'foto', name: 'Ana' },
        waitingVariable: null,
      },
      messageBody: 'x',
      justStarted: true,
    });
    expect(r.actions.find((a) => a.type === 'send_media')).toMatchObject({
      type: 'send_media',
      mediaType: 'image',
      mediaUrl: 'https://cdn.example/foto.jpg',
      caption: 'Olá Ana',
    });
    expect(r.session.status).toBe('ended');
  });

  it('emite send_media audio com media_type=audio', () => {
    const g: RuntimeGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
        {
          id: 'm',
          type: 'send_message',
          data: {
            send_mode: 'media',
            media_type: 'audio',
            media_url: 'https://cdn.example/voz.mp3',
            caption: 'ignorado',
            filename: 'voz.mp3',
          },
        },
        { id: 'end', type: 'end', data: {} },
      ],
      edges: [
        { id: 'a', source: 'start', target: 'm', sourceHandle: 'default' },
        { id: 'b', source: 'm', target: 'end', sourceHandle: 'default' },
      ],
    };
    const r = processInboundStep({
      graph: g,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: {},
        waitingVariable: null,
      },
      messageBody: 'x',
      justStarted: true,
    });
    expect(r.actions.find((a) => a.type === 'send_media')).toMatchObject({
      type: 'send_media',
      mediaType: 'audio',
      mediaUrl: 'https://cdn.example/voz.mp3',
      filename: 'voz.mp3',
    });
    expect((r.actions.find((a) => a.type === 'send_media') as any)?.caption).toBeUndefined();
  });

  it('emite send_media document', () => {
    const g: RuntimeGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
        {
          id: 'm',
          type: 'send_message',
          data: {
            send_mode: 'media',
            media_type: 'document',
            media_url: 'https://cdn.example/proposta.pdf',
            caption: 'Sua proposta',
            filename: 'proposta.pdf',
          },
        },
        { id: 'end', type: 'end', data: {} },
      ],
      edges: [
        { id: 'a', source: 'start', target: 'm', sourceHandle: 'default' },
        { id: 'b', source: 'm', target: 'end', sourceHandle: 'default' },
      ],
    };
    const r = processInboundStep({
      graph: g,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: {},
        waitingVariable: null,
      },
      messageBody: 'x',
      justStarted: true,
    });
    expect(r.actions.find((a) => a.type === 'send_media')).toMatchObject({
      type: 'send_media',
      mediaType: 'document',
      mediaUrl: 'https://cdn.example/proposta.pdf',
      caption: 'Sua proposta',
      filename: 'proposta.pdf',
    });
  });

  it('modo texto permanece send_text', () => {
    const g: RuntimeGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
        { id: 'm', type: 'send_message', data: { text: 'Oi {{name}}' } },
        { id: 'end', type: 'end', data: {} },
      ],
      edges: [
        { id: 'a', source: 'start', target: 'm', sourceHandle: 'default' },
        { id: 'b', source: 'm', target: 'end', sourceHandle: 'default' },
      ],
    };
    const r = processInboundStep({
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
    expect(r.actions.some((a) => a.type === 'send_text' && a.text === 'Oi Ana')).toBe(true);
    expect(r.actions.some((a) => a.type === 'send_media')).toBe(false);
  });
});

describe('S33.2 send_message media_asset_id', () => {
  const ASSET_ID = '11111111-1111-4111-8111-111111111111';

  it('schema aceita media_asset_id sem media_url', () => {
    const parsed = sendMessageDataSchema.safeParse({
      send_mode: 'media',
      media_type: 'image',
      media_asset_id: ASSET_ID,
      media_asset_label: 'foto.jpg',
      media_url: '',
    });
    expect(parsed.success).toBe(true);
  });

  it('schema rejeita media sem url e sem asset', () => {
    const parsed = sendMessageDataSchema.safeParse({
      send_mode: 'media',
      media_type: 'image',
      media_url: '',
      media_asset_id: '',
    });
    expect(parsed.success).toBe(false);
  });

  it('emite send_media com assetId da library', () => {
    const g: RuntimeGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
        {
          id: 'm',
          type: 'send_message',
          data: {
            send_mode: 'media',
            media_type: 'document',
            media_asset_id: ASSET_ID,
            media_asset_label: 'proposta.pdf',
            caption: 'Segue {{name}}',
            filename: 'proposta.pdf',
          },
        },
        { id: 'end', type: 'end', data: {} },
      ],
      edges: [
        { id: 'a', source: 'start', target: 'm', sourceHandle: 'default' },
        { id: 'b', source: 'm', target: 'end', sourceHandle: 'default' },
      ],
    };
    const r = processInboundStep({
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
    expect(r.actions.find((a) => a.type === 'send_media')).toMatchObject({
      type: 'send_media',
      mediaType: 'document',
      assetId: ASSET_ID,
      caption: 'Segue Ana',
      filename: 'proposta.pdf',
    });
    const media = r.actions.find((a) => a.type === 'send_media') as {
      mediaUrl?: string;
    };
    expect(media.mediaUrl).toBeUndefined();
  });
});

describe('S34 send_message sequence', () => {
  it('schema aceita messages[] e legado root', () => {
    expect(
      sendMessageDataSchema.safeParse({
        text: 'Olá',
      }).success
    ).toBe(true);
    expect(
      sendMessageDataSchema.safeParse({
        messages: [
          { id: 'a', send_mode: 'text', text: 'um' },
          {
            id: 'b',
            send_mode: 'media',
            media_type: 'image',
            media_url: 'https://cdn.example/x.jpg',
            delay_after: { amount: 5, unit: 'seconds' },
          },
        ],
      }).success
    ).toBe(true);
    expect(
      sendMessageDataSchema.safeParse({
        messages: [{ id: 'a', send_mode: 'text', text: '' }],
      }).success
    ).toBe(false);
  });

  it('envia sequência na ordem sem delay', () => {
    const g: RuntimeGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
        {
          id: 'm',
          type: 'send_message',
          data: {
            messages: [
              { id: 'a', send_mode: 'text', text: 'um' },
              { id: 'b', send_mode: 'text', text: 'dois {{name}}' },
              {
                id: 'c',
                send_mode: 'media',
                media_type: 'image',
                media_url: 'https://cdn.example/{{slug}}.jpg',
                caption: 'cap',
              },
            ],
          },
        },
        { id: 'end', type: 'end', data: {} },
      ],
      edges: [
        { id: 'a', source: 'start', target: 'm', sourceHandle: 'default' },
        { id: 'b', source: 'm', target: 'end', sourceHandle: 'default' },
      ],
    };
    const r = processInboundStep({
      graph: g,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: { name: 'Ana', slug: 'foto' },
        waitingVariable: null,
      },
      messageBody: 'x',
      justStarted: true,
    });
    const texts = r.actions.filter((a) => a.type === 'send_text').map((a) => (a as { text: string }).text);
    expect(texts).toEqual(['um', 'dois Ana']);
    expect(r.actions.find((a) => a.type === 'send_media')).toMatchObject({
      type: 'send_media',
      mediaUrl: 'https://cdn.example/foto.jpg',
      caption: 'cap',
    });
    expect(r.session.status).toBe('ended');
    expect(r.session.variables['_send_message.cursor']).toBeUndefined();
  });

  it('delay_after pausa e resumeFromDelay continua no mesmo nó', () => {
    const g: RuntimeGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
        {
          id: 'm',
          type: 'send_message',
          data: {
            messages: [
              {
                id: 'a',
                send_mode: 'text',
                text: 'antes',
                delay_after: { amount: 3, unit: 'seconds' },
              },
              { id: 'b', send_mode: 'text', text: 'depois' },
            ],
          },
        },
        { id: 'end', type: 'end', data: {} },
      ],
      edges: [
        { id: 'a', source: 'start', target: 'm', sourceHandle: 'default' },
        { id: 'b', source: 'm', target: 'end', sourceHandle: 'default' },
      ],
    };
    const r1 = processInboundStep({
      graph: g,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: {},
        waitingVariable: null,
      },
      messageBody: 'x',
      justStarted: true,
    });
    expect(r1.session.status).toBe('waiting_delay');
    expect(r1.session.currentNodeId).toBe('m');
    expect(r1.actions.some((a) => a.type === 'send_text' && a.text === 'antes')).toBe(true);
    expect(r1.actions.some((a) => a.type === 'send_text' && a.text === 'depois')).toBe(false);
    expect(r1.actions.find((a) => a.type === 'delay')).toMatchObject({
      type: 'delay',
      amount: 3,
      unit: 'seconds',
    });

    const r2 = processInboundStep({
      graph: g,
      session: r1.session,
      messageBody: null,
      resumeFromDelay: true,
    });
    expect(r2.actions.some((a) => a.type === 'send_text' && a.text === 'depois')).toBe(true);
    expect(r2.session.status).toBe('ended');
    expect(r2.session.variables['_send_message.cursor']).toBeUndefined();
  });

  it('burst sem delay_after respeita teto e retoma', () => {
    const msgs = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      send_mode: 'text' as const,
      text: `t${i}`,
    }));
    const g: RuntimeGraph = {
      nodes: [
        { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
        { id: 'm', type: 'send_message', data: { messages: msgs } },
        { id: 'end', type: 'end', data: {} },
      ],
      edges: [
        { id: 'a', source: 'start', target: 'm', sourceHandle: 'default' },
        { id: 'b', source: 'm', target: 'end', sourceHandle: 'default' },
      ],
    };
    const r1 = processInboundStep({
      graph: g,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: {},
        waitingVariable: null,
      },
      messageBody: 'x',
      justStarted: true,
    });
    expect(r1.session.status).toBe('waiting_delay');
    expect(r1.actions.filter((a) => a.type === 'send_text')).toHaveLength(10);
    expect(r1.actions.find((a) => a.type === 'delay')).toMatchObject({
      amount: 1,
      unit: 'seconds',
    });

    const r2 = processInboundStep({
      graph: g,
      session: r1.session,
      messageBody: null,
      resumeFromDelay: true,
    });
    expect(r2.actions.filter((a) => a.type === 'send_text')).toHaveLength(2);
    expect(r2.session.status).toBe('ended');
  });
});
