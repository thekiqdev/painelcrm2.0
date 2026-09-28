/** Intervalo do worker SLA / automação (ms). Mínimo 30s. */
export function getChatAutomationWorkerPollMs(): number {
  return Math.max(30_000, parseInt(process.env.CHAT_AUTOMATION_POLL_MS || '120000', 10));
}
