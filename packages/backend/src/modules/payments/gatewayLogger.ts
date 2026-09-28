/**
 * Log estruturado para operações de gateway (PLANO-EVOLUCAO-PAYMENT-GATEWAYS-PANEL Fase 2).
 * Formato: [PAYMENT_GATEWAY] gateway=… tenant=… operation=… duration=… status=…
 */
export function logGatewayOperation(params: {
  gateway: string;
  tenantId?: string | null;
  operation: string;
  durationMs: number;
  status: 'success' | 'error';
  error?: string;
}): void {
  const parts = [
    '[PAYMENT_GATEWAY]',
    `gateway=${params.gateway}`,
    params.tenantId != null ? `tenant=${params.tenantId}` : '',
    `operation=${params.operation}`,
    `duration=${params.durationMs}ms`,
    `status=${params.status}`,
  ].filter(Boolean);
  if (params.status === 'error' && params.error) {
    parts.push(`error=${params.error}`);
  }
  const line = parts.join(' ');
  if (params.status === 'error') {
    console.error(line);
  } else {
    console.info(line);
  }
}
