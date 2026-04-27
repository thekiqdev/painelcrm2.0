/**
 * Substitui marcadores de data no HTML público das páginas legais (antes do sanitize).
 * Cobre {{DATA}}, {{data}}, {{ Data }}, etc.
 */
export function replaceLegalDatePlaceholders(html: string, dateDisplay: string): string {
  if (!html) return '';
  return html.replace(/\{\{\s*data\s*\}\}/gi, dateDisplay);
}

/** Data por extenso em pt-BR para texto legal (ex.: 27 de abril de 2026). */
export function formatLegalPublicationDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return null;
  }
}
