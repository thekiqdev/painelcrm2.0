/**
 * Tipos compartilhados do painel de gateways (GET /api/me/tenant/payment-gateways/status).
 */
export interface GatewayStatusItem {
  key: string;
  name: string;
  is_enabled: boolean;
  configured: boolean;
  connection_status: string | null;
  last_connection_test_at: string | null;
  environment: string | null;
  webhook_configured: boolean;
  status: string | null;
}
