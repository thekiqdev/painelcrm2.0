/**
 * Telemetria opcional do endpoint público de pagamento (Fase 10).
 * Não registra token nem IDs de fatura — apenas tenant + forma do payload (suporte a incidentes).
 */
export function isPublicPayTelemetryEnabled(): boolean {
  return process.env.PUBLIC_PAY_TELEMETRY_LOG === 'true';
}

/**
 * Rollout atual: troca de método habilitada globalmente para todos os tenants.
 * Mantida como função para preservar contrato/compatibilidade de chamadas existentes.
 */
export function isPublicPaySwitchMethodEnabledForTenant(_tenantId: string): boolean {
  return true;
}
