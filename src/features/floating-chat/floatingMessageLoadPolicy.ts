/**
 * MB-019 — política de hidratação de mensagens do Floating.
 * Dump integral só com rollback explícito (ADR-011).
 */
export function shouldFloatDumpAllMessages(): boolean {
  try {
    return String(import.meta.env.VITE_FLOAT_MESSAGES_DUMP || '') === '1';
  } catch {
    return false;
  }
}
