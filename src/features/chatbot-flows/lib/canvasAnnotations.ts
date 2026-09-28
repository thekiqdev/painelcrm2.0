import { z } from 'zod';

/** Nós só de canvas — não entram no runtime WhatsApp. */
export const EDITOR_ONLY_NODE_TYPES = [
  'sticky_note',
  'annotation_arrow',
  'annotation_text',
] as const;

export type EditorOnlyNodeType = (typeof EDITOR_ONLY_NODE_TYPES)[number];

export type BoardTool = 'select' | 'hand' | 'sticky' | 'arrow' | 'text';

export const STICKY_COLORS = [
  { id: 'amber', label: 'Âmbar', bg: '#f59e0b', text: '#1c1917', border: '#b45309' },
  { id: 'rose', label: 'Rosa', bg: '#fb7185', text: '#1c1917', border: '#e11d48' },
  { id: 'sky', label: 'Azul', bg: '#38bdf8', text: '#0f172a', border: '#0284c7' },
  { id: 'lime', label: 'Verde', bg: '#a3e635', text: '#14532d', border: '#65a30d' },
  { id: 'violet', label: 'Violeta', bg: '#a78bfa', text: '#1e1b4b', border: '#7c3aed' },
  { id: 'slate', label: 'Cinza', bg: '#94a3b8', text: '#0f172a', border: '#475569' },
] as const;

export type StickyColorId = (typeof STICKY_COLORS)[number]['id'];

export const ARROW_COLORS = [
  { id: 'slate', label: 'Cinza', stroke: '#64748b' },
  { id: 'rose', label: 'Vermelho', stroke: '#e11d48' },
  { id: 'emerald', label: 'Verde', stroke: '#059669' },
  { id: 'sky', label: 'Azul', stroke: '#0284c7' },
  { id: 'amber', label: 'Âmbar', stroke: '#d97706' },
  { id: 'violet', label: 'Violeta', stroke: '#7c3aed' },
] as const;

export type ArrowColorId = (typeof ARROW_COLORS)[number]['id'];

export const TEXT_COLORS = [
  { id: 'slate', label: 'Escuro', fill: '#0f172a' },
  { id: 'rose', label: 'Vermelho', fill: '#e11d48' },
  { id: 'sky', label: 'Azul', fill: '#0284c7' },
  { id: 'emerald', label: 'Verde', fill: '#059669' },
  { id: 'amber', label: 'Âmbar', fill: '#d97706' },
  { id: 'violet', label: 'Violeta', fill: '#7c3aed' },
] as const;

export type TextColorId = (typeof TEXT_COLORS)[number]['id'];

export const stickyNoteDataSchema = z.object({
  label: z.string().optional(),
  text: z.string().optional().default(''),
  color: z
    .enum(['amber', 'rose', 'sky', 'lime', 'violet', 'slate'])
    .optional()
    .default('amber'),
  width: z.number().min(80).max(2400).optional().default(220),
  height: z.number().min(60).max(1800).optional().default(140),
});

export const annotationArrowDataSchema = z.object({
  label: z.string().optional(),
  text: z.string().optional().default(''),
  color: z
    .enum(['slate', 'rose', 'emerald', 'sky', 'amber', 'violet'])
    .optional()
    .default('slate'),
  /** Coordenadas locais dentro do bbox do nó. */
  x1: z.number().optional().default(14),
  y1: z.number().optional().default(14),
  x2: z.number().optional().default(174),
  y2: z.number().optional().default(54),
  width: z.number().min(24).max(4000).optional().default(188),
  height: z.number().min(24).max(4000).optional().default(68),
});

export const annotationTextDataSchema = z.object({
  label: z.string().optional(),
  text: z.string().optional().default('Texto'),
  color: z
    .enum(['slate', 'rose', 'sky', 'emerald', 'amber', 'violet'])
    .optional()
    .default('slate'),
  fontSize: z.number().min(12).max(72).optional().default(20),
  width: z.number().min(80).max(1200).optional().default(200),
  height: z.number().min(36).max(800).optional().default(48),
});

export const EDITOR_ONLY_LABELS: Record<EditorOnlyNodeType, string> = {
  sticky_note: 'Sticky note',
  annotation_arrow: 'Seta',
  annotation_text: 'Texto',
};

export function isEditorOnlyNodeType(type: string | undefined | null): boolean {
  return (EDITOR_ONLY_NODE_TYPES as readonly string[]).includes(String(type || ''));
}

export function stickyColorMeta(color: string | undefined) {
  return STICKY_COLORS.find((c) => c.id === color) ?? STICKY_COLORS[0];
}

export function arrowColorMeta(color: string | undefined) {
  return ARROW_COLORS.find((c) => c.id === color) ?? ARROW_COLORS[0];
}

export function textColorMeta(color: string | undefined) {
  return TEXT_COLORS.find((c) => c.id === color) ?? TEXT_COLORS[0];
}

export function defaultStickyNoteData() {
  return {
    label: EDITOR_ONLY_LABELS.sticky_note,
    text: 'Nota',
    color: 'amber' as StickyColorId,
    width: 220,
    height: 140,
  };
}

export function defaultAnnotationArrowData() {
  return {
    label: EDITOR_ONLY_LABELS.annotation_arrow,
    text: '',
    color: 'slate' as ArrowColorId,
    x1: 14,
    y1: 14,
    x2: 174,
    y2: 54,
    width: 188,
    height: 68,
  };
}

export function defaultAnnotationTextData() {
  return {
    label: EDITOR_ONLY_LABELS.annotation_text,
    text: 'Texto',
    color: 'slate' as TextColorId,
    fontSize: 20,
    width: 200,
    height: 48,
  };
}

export function defaultDataForEditorOnly(type: EditorOnlyNodeType) {
  if (type === 'annotation_arrow') return defaultAnnotationArrowData();
  if (type === 'annotation_text') return defaultAnnotationTextData();
  return defaultStickyNoteData();
}

/** Monta seta com bbox real a partir de dois pontos no fluxo. */
export function buildArrowFromFlowPoints(
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  const PAD = 14;
  let x1 = start.x;
  let y1 = start.y;
  let x2 = end.x;
  let y2 = end.y;
  if (Math.hypot(x2 - x1, y2 - y1) < 8) {
    x2 = x1 + 120;
    y2 = y1;
  }
  const minX = Math.min(x1, x2) - PAD;
  const minY = Math.min(y1, y2) - PAD;
  const maxX = Math.max(x1, x2) + PAD;
  const maxY = Math.max(y1, y2) + PAD;
  const width = Math.max(24, Math.round(maxX - minX));
  const height = Math.max(24, Math.round(maxY - minY));
  return {
    position: { x: minX, y: minY },
    data: {
      ...defaultAnnotationArrowData(),
      x1: Math.round(x1 - minX),
      y1: Math.round(y1 - minY),
      x2: Math.round(x2 - minX),
      y2: Math.round(y2 - minY),
      width,
      height,
    },
  };
}
