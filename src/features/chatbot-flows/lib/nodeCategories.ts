import type { EssentialNodeType } from './nodeCatalog';
import { NODE_LABELS } from './nodeCatalog';
import {
  EDITOR_ONLY_LABELS,
  type EditorOnlyNodeType,
} from './canvasAnnotations';

export type PaletteNodeType = EssentialNodeType | EditorOnlyNodeType;

export type NodePaletteCategory = {
  id: string;
  label: string;
  description: string;
  types: PaletteNodeType[];
};

/** Categorias da grade “Adicionar nó” (só runtime — anotações na barra superior). */
export const NODE_PALETTE_CATEGORIES: NodePaletteCategory[] = [
  {
    id: 'entry',
    label: 'Início',
    description: 'Pontos de entrada do fluxo',
    types: ['start', 'webhook_in'],
  },
  {
    id: 'messages',
    label: 'Mensagens',
    description: 'Texto, perguntas e menus',
    types: ['send_message', 'wait_input', 'menu_choice'],
  },
  {
    id: 'logic',
    label: 'Lógica',
    description: 'Condições e variáveis',
    types: ['condition', 'set_variable', 'delay'],
  },
  {
    id: 'crm',
    label: 'CRM',
    description: 'Tags, atribuição, Kanban, faturas e notas',
    types: ['add_tag', 'assign_agent', 'move_kanban', 'invoice_assist', 'conversation_note'],
  },
  {
    id: 'integrations',
    label: 'Integrações',
    description: 'HTTP e webhook de saída',
    types: ['http_request', 'webhook_out'],
  },
  {
    id: 'handoff',
    label: 'Encerramento',
    description: 'Humano, resolver ou fim do fluxo',
    types: ['transfer_human', 'resolve_conversation', 'end'],
  },
];

export function paletteItemLabel(type: PaletteNodeType): string {
  if (type in EDITOR_ONLY_LABELS) {
    return EDITOR_ONLY_LABELS[type as EditorOnlyNodeType];
  }
  return NODE_LABELS[type as EssentialNodeType] || type;
}

export const REACTFLOW_DND_TYPE = 'application/painelcrm-flow-node';
