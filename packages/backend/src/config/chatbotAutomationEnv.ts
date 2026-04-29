/**
 * Fase 8 — Chatbot básico (kill switch em produção).
 * `.env`: CHAT_AUTOMATION_ENABLED=true|false (default true se ausente para não mudar comportamento após deploy da migração).
 */
function envExplicitlyOff(raw: string | undefined): boolean {
  if (raw == null || String(raw).trim() === '') return false;
  const v = String(raw).trim().toLowerCase();
  return v === '0' || v === 'false' || v === 'no';
}

function envExplicitlyOn(raw: string | undefined): boolean {
  if (raw == null || String(raw).trim() === '') return false;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Motor do chatbot Fase 8 (avaliação + envio automático). Por defeito desligado até `CHAT_AUTOMATION_ENABLED=true`. */
export function isChatAutomationEnabled(): boolean {
  if (envExplicitlyOff(process.env.CHAT_AUTOMATION_ENABLED)) return false;
  if (envExplicitlyOn(process.env.CHAT_AUTOMATION_ENABLED)) return true;
  return false;
}
