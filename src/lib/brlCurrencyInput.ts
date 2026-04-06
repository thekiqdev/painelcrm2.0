/**
 * Parse e formatação BRL para campos monetários (Fase 2 — A5).
 * Aceita vírgula decimal e separador de milhar com ponto (ex.: 1.234,56).
 */

/** Remove letras e símbolos; mantém apenas dígitos, vírgula e ponto (valores pt-BR). */
export function sanitizeNumericFieldInput(raw: string): string {
  return (raw ?? "").replace(/[^\d.,]/g, "");
}

export function parseBrl(s: string): number {
  let t = (s || "").trim().replace(/\s/g, "");
  if (!t) return 0;
  if (t.includes(",")) {
    t = t.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

/** Valor em reais → string pt-BR com 2 decimais (uso em blur / exibição). */
export function formatBrlDisplay(reais: number): string {
  return reais.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
