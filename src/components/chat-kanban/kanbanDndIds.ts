/** Prefixo estável para zonas de drop por coluna (não colide com UUID). */
export const KANBAN_DROP_PREFIX = 'kanban-drop::';

export function kanbanColumnDropId(columnId: string): string {
  return `${KANBAN_DROP_PREFIX}${columnId}`;
}
