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
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : 0;
  }
  // Sem vírgula: padrão pt-BR "1.234.567" (só separador de milhar) vs "1.23" (decimal à la en)
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
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

/**
 * Máscara pt-BR enquanto digita: milhares com ponto, decimais com vírgula (até 2 casas).
 * Estados intermédios como "10," são preservados.
 */
export function formatBrlInputMask(raw: string): string {
  const s = sanitizeNumericFieldInput(raw);
  if (!s) return "";

  const commaIdx = s.lastIndexOf(",");
  const hasComma = commaIdx !== -1;

  if (hasComma) {
    const intDigits = s.slice(0, commaIdx).replace(/\D/g, "") || "0";
    const intNum = parseInt(intDigits, 10);
    if (!Number.isFinite(intNum)) return "0,";
    const intFormatted = intNum.toLocaleString("pt-BR");
    const decDigits = s.slice(commaIdx + 1).replace(/\D/g, "").slice(0, 2);
    return `${intFormatted},${decDigits}`;
  }

  const intDigits = s.replace(/\D/g, "");
  if (!intDigits) return "";
  const intNum = parseInt(intDigits, 10);
  if (!Number.isFinite(intNum)) return "";
  return intNum.toLocaleString("pt-BR");
}

/** Percentual 0–100 com até 2 decimais (vírgula), sem separador de milhar. */
export function formatPercentInputMask(raw: string): string {
  const s = sanitizeNumericFieldInput(raw).replace(/\./g, "");
  if (!s) return "";

  const commaIdx = s.lastIndexOf(",");
  if (commaIdx !== -1) {
    const intDigits = s.slice(0, commaIdx).replace(/\D/g, "");
    const decDigits = s.slice(commaIdx + 1).replace(/\D/g, "").slice(0, 2);
    let intNum = intDigits === "" ? 0 : parseInt(intDigits, 10);
    if (!Number.isFinite(intNum)) intNum = 0;
    if (intNum > 100) return "100";
    if (intNum === 100 && decDigits.length > 0) return "100";
    const intShow = intDigits === "" ? "0" : String(intNum);
    return `${intShow},${decDigits}`;
  }

  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  let intNum = parseInt(digits, 10);
  if (!Number.isFinite(intNum)) return "";
  if (intNum > 100) intNum = 100;
  return String(intNum);
}
