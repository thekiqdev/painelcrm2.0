import type { Connection, Edge } from '@xyflow/react';

/** Estilo de edge conforme handle de origem (ok / erro / padrão). */
export function decorateFlowEdge<T extends Edge | (Connection & { id?: string })>(
  edge: T
): T & Edge {
  const handle = ('sourceHandle' in edge ? edge.sourceHandle : null) || 'default';
  const base = {
    ...edge,
    type: 'flowDeletable' as const,
    animated: true,
  };

  if (
    handle === 'false' ||
    handle === 'error' ||
    handle === 'empty' ||
    handle === 'invalid' ||
    handle === 'fallback'
  ) {
    return {
      ...base,
      className: 'chatbot-flow-edge chatbot-flow-edge--error',
      style: { stroke: '#e11d48', strokeWidth: 2.25 },
    } as T & Edge;
  }

  if (handle === 'true') {
    return {
      ...base,
      className: 'chatbot-flow-edge chatbot-flow-edge--ok',
      style: { stroke: '#059669', strokeWidth: 2.25 },
    } as T & Edge;
  }

  return {
    ...base,
    className: 'chatbot-flow-edge',
    style: { stroke: '#64748b', strokeWidth: 2 },
  } as T & Edge;
}
