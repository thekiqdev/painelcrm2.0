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
