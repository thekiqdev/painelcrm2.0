import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, Settings, Loader2, Wifi } from "lucide-react";
import { GatewayStatusBadge, toGatewayStatusType } from "./GatewayStatusBadge";
import { GatewayFeatureList } from "./GatewayFeatureList";
import { GatewayBrandLogo } from "./GatewayBrandLogo";
import {
  gatewayCardActionsRowClass,
  gatewayCardBodyClass,
  gatewayCardClassName,
  gatewayCardIdentityRowClass,
  gatewayCardStatusSectionClass,
  gatewayCardTitleStackClass,
} from "./gatewayCardLayout";
import type { GatewayStatusItem } from "./gatewayPanelTypes";
import { formatGatewayLastTest } from "./gatewayPanelUtils";
import { apiClient } from "@/integrations/api/client";
import { toast } from "@/components/ui/sonner";

const API_TEST = "/api/me/tenant/payment-gateway/test";
const ASAAS_LOGO = "/branding/gateways/asaas.png";

interface AsaasGatewayCardProps {
  item: GatewayStatusItem;
  onStatusChange?: () => void;
}

export const AsaasGatewayCard: React.FC<AsaasGatewayCardProps> = ({ item, onStatusChange }) => {
  const [testing, setTesting] = useState(false);

  const statusType = toGatewayStatusType({
    configured: item.configured,
    status: item.status,
    connection_status: item.connection_status,
  });

  const handleTestConnection = async () => {
    if (!item.configured) {
      toast.error("Configure o gateway antes de testar.");
      return;
    }
    setTesting(true);
    const res = await apiClient.post<{ connected: boolean; error?: string }>(API_TEST, {
      gateway_key: item.key,
    });
    setTesting(false);
    const statusCode = (res as { details?: { status?: number } }).details?.status;
    if (res.error && statusCode === 429) {
      toast.error("Máximo de 5 testes por minuto. Tente novamente em instantes.");
      return;
    }
    if (res.data?.connected) {
      toast.success("Conexão com o Asaas realizada com sucesso.");
      onStatusChange?.();
    } else {
      toast.error(res.data?.error || res.error || "Falha ao testar conexão.");
      onStatusChange?.();
    }
  };

  const envBadge =
    item.environment === "production" ? (
      <Badge className="border-emerald-500/30 bg-emerald-500/12 text-emerald-900 dark:text-emerald-100">
        Produção
      </Badge>
    ) : item.environment === "sandbox" ? (
      <Badge variant="secondary">Sandbox</Badge>
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    );

  const webhookBadge = item.configured ? (
    item.webhook_configured ? (
      <Badge className="border-emerald-500/30 bg-emerald-500/12 text-emerald-900 dark:text-emerald-100">Ativo</Badge>
    ) : (
      <Badge variant="outline" className="font-normal">
        Pendente
      </Badge>
    )
  ) : (
    <span className="text-xs text-muted-foreground">—</span>
  );

  return (
    <Card className={gatewayCardClassName()}>
      <CardHeader className="space-y-3 px-5 pb-2 pt-5">
        <div className={gatewayCardIdentityRowClass}>
          <GatewayBrandLogo
            src={ASAAS_LOGO}
            alt="Asaas"
            fallback={<Wallet className="mx-auto h-5 w-5 text-sky-700 dark:text-sky-300" aria-hidden />}
          />
          <div className={gatewayCardTitleStackClass}>
            <h3 className="break-words text-base font-semibold leading-snug tracking-tight text-foreground">
              {item.name}
            </h3>
            <GatewayStatusBadge status={statusType} variant="compact" />
          </div>
        </div>

        <div className={gatewayCardStatusSectionClass}>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ambiente</p>
            <div className="mt-1.5">{envBadge}</div>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Último teste</p>
            <p className="mt-1.5 text-sm font-medium text-foreground">{formatGatewayLastTest(item.last_connection_test_at)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Webhook</p>
            <div className="mt-1.5">{webhookBadge}</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-0">
        <div className={gatewayCardBodyClass}>
          <GatewayFeatureList items={["Emissão de cobranças", "Pix, boleto e cartão", "Notificações automáticas"]} />
          <div className={gatewayCardActionsRowClass}>
            <Button asChild variant="outline" size="sm">
              <Link to={`/settings/payments/${item.key}`}>
                <Settings className="mr-2 h-4 w-4" />
                Configurar
              </Link>
            </Button>
            {item.configured ? (
              <Button type="button" variant="default" size="sm" onClick={() => void handleTestConnection()} disabled={testing || statusType === "disabled"}>
                {testing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testando…
                  </>
                ) : (
                  <>
                    <Wifi className="mr-2 h-4 w-4" />
                    Testar conexão
                  </>
                )}
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
