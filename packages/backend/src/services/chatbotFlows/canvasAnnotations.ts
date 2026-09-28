/**
 * Anotações de canvas (S15a) — sticky / seta / texto. Só editor; runtime ignora.
 */
import { z } from 'zod';

export const EDITOR_ONLY_NODE_TYPES = [
  'sticky_note',
  'annotation_arrow',
  'annotation_text',
] as const;
export type EditorOnlyNodeType = (typeof EDITOR_ONLY_NODE_TYPES)[number];

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
  x1: z.number().optional().default(14),
  y1: z.number().optional().default(14),
  x2: z.number().optional().default(174),
  y2: z.number().optional().default(54),
  width: z.number().min(24).max(4000).optional().default(188),
  height: z.number().min(24).max(4000).optional().default(68),
  /** Legado S15a inicial */
  endX: z.number().optional(),
  endY: z.number().optional(),
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

export function isEditorOnlyNodeType(type: string | undefined | null): boolean {
  return (EDITOR_ONLY_NODE_TYPES as readonly string[]).includes(String(type || ''));
}

const EDITOR_SCHEMAS = {
  sticky_note: stickyNoteDataSchema,
  annotation_arrow: annotationArrowDataSchema,
  annotation_text: annotationTextDataSchema,
} as const;

export function validateEditorOnlyNodeData(
  type: string,
  data: Record<string, unknown>
): { ok: true } | { ok: false; message: string } {
  if (!isEditorOnlyNodeType(type)) return { ok: true };
  const schema = EDITOR_SCHEMAS[type as EditorOnlyNodeType];
  const parsed = schema.safeParse(data || {});
  if (!parsed.success) {
    return {
      ok: false,
      message: `${type}: ${parsed.error.issues[0]?.message || 'dados inválidos'}`,
    };
  }
  return { ok: true };
}
