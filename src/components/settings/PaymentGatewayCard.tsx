/**
 * Card de gateway no painel de pagamentos (Fase 7 — PLANO-EVOLUCAO-PAYMENT-GATEWAYS-PANEL).
 * Nome, GatewayStatusBadge, último teste, ambiente, webhook, botões Configurar e Testar conexão.
 */
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings, Loader2, Wifi } from "lucide-react";
import { GatewayStatusBadge, toGatewayStatusType } from "./GatewayStatusBadge";
import { apiClient } from "@/integrations/api/client";
import { toast } from "sonner";

const API_TEST = "/api/me/tenant/payment-gateway/test";
const API_STATUS = "/api/me/tenant/payment-gateways/status";

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

function formatLastTest(lastAt: string | null): string {
  if (!lastAt) return "Nunca testado";
  const date = new Date(lastAt);
  if (Number.isNaN(date.getTime())) return "Nunca testado";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);
  if (diffMin < 1) return "Há menos de 1 minuto";
  if (diffMin < 60) return `Há ${diffMin} minuto${diffMin !== 1 ? "s" : ""}`;
  if (diffHour < 24) return `Há ${diffHour} hora${diffHour !== 1 ? "s" : ""}`;
  return `Há ${diffDay} dia${diffDay !== 1 ? "s" : ""}`;
}

interface PaymentGatewayCardProps {
  item: GatewayStatusItem;
  onStatusChange?: () => void;
}

export const PaymentGatewayCard: React.FC<PaymentGatewayCardProps> = ({
  item,
  onStatusChange,
}) => {
  const [testing, setTesting] = useState(false);

  const statusType = toGatewayStatusType({
    configured: item.configured,
    status: item.status,
    connection_status: item.connection_status,
  });

  const handleTestConnection = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!item.configured) {
      toast.error("Configure o gateway antes de testar.");
      return;
    }
    setTesting(true);
    const res = await apiClient.post<{ connected: boolean; error?: string }>(
      API_TEST,
      { gateway_key: item.key }
    );
    setTesting(false);
    const statusCode = (res as { details?: { status?: number } }).details?.status;
    if (res.error && statusCode === 429) {
      toast.error("Máximo de 5 testes por minuto. Tente novamente em instantes.");
      return;
    }
    if (res.data?.connected) {
      toast.success("Conexão com o gateway realizada com sucesso.");
      onStatusChange?.();
    } else {
      const err = res.data?.error || res.error || "Falha ao testar conexão.";
      toast.error(err);
      onStatusChange?.();
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{item.name}</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <GatewayStatusBadge status={statusType} />
          {item.environment && (
            <span className="text-muted-foreground">
              {item.environment === "production" ? "Produção" : "Sandbox"}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-auto space-y-3 pt-4">
        <div className="text-sm text-muted-foreground">
          <p>Último teste: {formatLastTest(item.last_connection_test_at)}</p>
          {item.configured && item.webhook_configured && (
            <p className="mt-0.5">Webhook: configurado</p>
          )}
          {item.configured && (
            <p className="mt-0.5 text-xs">Testar conexão ativa o gateway para emissão de faturas.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/settings/payments/${item.key}`}>
              <Settings className="h-4 w-4 mr-1.5" />
              Configurar
            </Link>
          </Button>
          {item.configured && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testing || statusType === "disabled"}
            >
              {testing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Testando...
                </>
              ) : (
                <>
                  <Wifi className="h-4 w-4 mr-1.5" />
                  Testar conexão
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
