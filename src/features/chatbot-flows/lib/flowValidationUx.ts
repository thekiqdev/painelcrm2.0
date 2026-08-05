import type { Edge, Node } from '@xyflow/react';
import {
  defaultDataForType,
  NODE_LABELS,
  type GraphValidationIssue,
} from './nodeCatalog';

/** Enriquece issues com dica + autofix para o editor. */
export function enrichValidationIssues(issues: GraphValidationIssue[]): GraphValidationIssue[] {
  return issues.map((issue) => {
    if (issue.hint && issue.autofix) return issue;
    switch (issue.code) {
      case 'edge_handle': {
        const handle = issue.handle || extractQuoted(issue.message) || 'esta saída';
        return {
          ...issue,
          handle: issue.handle || extractQuoted(issue.message) || undefined,
          hint:
            issue.hint ||
            `A conexão usa a saída "${handle}", que este nó não oferece. Remova a conexão inválida ou ligue pela saída correta.`,
          autofix: issue.autofix || (issue.edgeIds?.length ? 'remove_edges' : undefined),
          autofixLabel: issue.autofixLabel || 'Remover conexão inválida',
        };
      }
      case 'missing_out': {
        const handle = issue.handle || extractQuoted(issue.message) || 'default';
        return {
          ...issue,
          handle,
          hint:
            issue.hint ||
            `Conecte a saída "${handle}" a outro nó. O auto-resolver cria um nó Fim e liga essa saída.`,
          autofix: issue.autofix || 'wire_to_end',
          autofixLabel: issue.autofixLabel || `Ligar "${handle}" a um Fim`,
        };
      }
      case 'orphan':
        return {
          ...issue,
          hint:
            issue.hint ||
            'Este nó não tem entrada. Conecte a partir de outro nó, ou remova se não for usado.',
          autofix: issue.autofix || 'remove_orphan',
          autofixLabel: issue.autofixLabel || 'Remover nó órfão',
        };
      case 'node_data':
        return {
          ...issue,
          hint:
            issue.hint ||
            'Abra o painel do nó e complete os campos obrigatórios destacados.',
        };
      case 'unreachable':
        return {
          ...issue,
          hint:
            issue.hint ||
            'O nó não é alcançável a partir do Início. Conecte o fluxo ou remova o nó.',
        };
      default:
        return {
          ...issue,
          hint: issue.hint || 'Revise o nó marcado e as conexões ao redor.',
        };
    }
  });
}

function extractQuoted(message: string): string | null {
  const m = message.match(/"([^"]+)"/);
  return m?.[1] || null;
}

export function issuesByNodeId(
  issues: GraphValidationIssue[]
): Map<string, GraphValidationIssue[]> {
  const map = new Map<string, GraphValidationIssue[]>();
  for (const issue of issues) {
    for (const id of issue.nodeIds || []) {
      const list = map.get(id) || [];
      list.push(issue);
      map.set(id, list);
    }
  }
  return map;
}

export function applyInvalidHighlights(
  nodes: Node[],
  issues: GraphValidationIssue[]
): Node[] {
  const byNode = issuesByNodeId(issues);
  return nodes.map((n) => {
    const nodeIssues = byNode.get(n.id) || [];
    if (nodeIssues.length === 0) {
      const { invalid: _i, validationIssues: _v, ...rest } = (n.data || {}) as Record<
        string,
        unknown
      >;
      return { ...n, data: { ...rest, invalid: false } };
    }
    return {
      ...n,
      data: {
        ...n.data,
        invalid: true,
        validationIssues: nodeIssues,
      },
    };
  });
}

export function clearValidationHighlights(nodes: Node[]): Node[] {
  return nodes.map((n) => {
    const { invalid: _i, validationIssues: _v, ...rest } = (n.data || {}) as Record<
      string,
      unknown
    >;
    return { ...n, data: { ...rest, invalid: false } };
  });
}

export function applyValidationAutofix(opts: {
  issue: GraphValidationIssue;
  nodes: Node[];
  edges: Edge[];
}): { nodes: Node[]; edges: Edge[]; ok: boolean; message?: string } {
  const { issue, nodes, edges } = opts;
  if (issue.autofix === 'remove_edges') {
    const ids = new Set(issue.edgeIds || []);
    if (ids.size === 0) return { nodes, edges, ok: false, message: 'Sem conexão para remover' };
    return {
      nodes,
      edges: edges.filter((e) => !ids.has(e.id)),
      ok: true,
    };
  }

  if (issue.autofix === 'remove_orphan') {
    const nodeId = issue.nodeIds?.[0];
    if (!nodeId) return { nodes, edges, ok: false, message: 'Nó não encontrado' };
    return {
      nodes: nodes.filter((n) => n.id !== nodeId),
      edges: edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      ok: true,
    };
  }

  if (issue.autofix === 'wire_to_end') {
    const sourceId = issue.nodeIds?.[0];
    const handle = issue.handle || 'default';
    if (!sourceId) return { nodes, edges, ok: false, message: 'Nó não encontrado' };
    const source = nodes.find((n) => n.id === sourceId);
    if (!source) return { nodes, edges, ok: false, message: 'Nó não encontrado' };

    const endId = `end-${crypto.randomUUID().slice(0, 8)}`;
    const endNode: Node = {
      id: endId,
      type: 'end',
      position: {
        x: (source.position?.x || 0) + 260,
        y: (source.position?.y || 0) + (handle === 'else' || handle === 'error' ? 80 : 0),
      },
      data: { ...defaultDataForType('end') },
    };
    const edgeId = `e-${sourceId}-${handle}-${endId}`;
    const newEdge: Edge = {
      id: edgeId,
      source: sourceId,
      target: endId,
      sourceHandle: handle,
      type: 'flowDeletable',
      animated: true,
      className: 'chatbot-flow-edge',
      style: { stroke: '#64748b', strokeWidth: 2 },
    };
    return {
      nodes: [...nodes, endNode],
      edges: [...edges, newEdge],
      ok: true,
    };
  }

  return { nodes, edges, ok: false, message: 'Sem auto-resolver para este erro' };
}

export function nodeLabelForIssue(
  issue: GraphValidationIssue,
  nodes: Node[]
): string {
  const id = issue.nodeIds?.[0];
  if (!id) return 'Fluxo';
  const node = nodes.find((n) => n.id === id);
  if (!node) return id;
  const type = String(node.type || '');
  const label =
    (node.data as { label?: string } | undefined)?.label ||
    (type in NODE_LABELS ? NODE_LABELS[type as keyof typeof NODE_LABELS] : type);
  return String(label);
}
