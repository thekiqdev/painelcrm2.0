/**
 * Índice fracionário (DOUBLE PRECISION) para ordenação de cards no Kanban.
 * Insere entre vizinhos sem renumerar toda a coluna.
 */
export function computeKanbanInsertPosition(prevPos: number | null, nextPos: number | null): number {
  if (prevPos == null && nextPos == null) return 1;
  if (prevPos == null && nextPos != null) {
    const n = Number(nextPos);
    if (!Number.isFinite(n)) return 1;
    return n > 1 ? n - 1 : n / 2;
  }
  if (prevPos != null && nextPos == null) {
    const p = Number(prevPos);
    return Number.isFinite(p) ? p + 1 : 1;
  }
  const p = Number(prevPos);
  const n = Number(nextPos);
  if (!Number.isFinite(p) || !Number.isFinite(n)) return 1;
  if (Math.abs(p - n) < 1e-12) return p + 1;
  return (p + n) / 2;
}
