/** PostgreSQL: undefined_column */
export function isPgUndefinedColumn(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === '42703';
}
