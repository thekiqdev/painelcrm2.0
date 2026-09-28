import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Settings, Plus, PlugZap } from "lucide-react";
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

const API_AVAILABILITY = "/api/integrations/mercado-pago/availability";
const API_CONNECT_URL = "/api/integrations/mercado-pago/connect-url";
const API_STATUS = "/api/integrations/mercado-pago/status";
const API_TEST = "/api/me/tenant/payment-gateway/test";
const MP_LOGO = "/branding/gateways/mercado-pago.png";

type Availability = {
  enabled: boolean;
  oauth_environment?: "sandbox" | "production";
};

type MpStatus = {
  connected: boolean;
  environment: "sandbox" | "production" | null;
  last_test_at: string | null;
  last_connection_status: string | null;
  config_status: string | null;
};

interface MercadoPagoGatewayPanelCardProps {
  item: GatewayStatusItem;
  onStatusChange?: () => void;
}

function envBadgeNode(mode: "sandbox" | "production" | null): React.ReactNode {
  if (mode === "production") {
    return (
      <Badge className="border-emerald-500/30 bg-emerald-500/12 text-emerald-900 dark:text-emerald-100">Produção</Badge>
    );
  }
  if (mode === "sandbox") {
    return <Badge variant="secondary">Sandbox</Badge>;
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

function webhookMpLabel(connected: boolean): React.ReactNode {
  if (!connected) {
    return <span className="text-xs text-muted-foreground">Não configurado</span>;
  }
  return (
    <Badge className="border-emerald-500/30 bg-emerald-500/12 text-emerald-900 dark:text-emerald-100">Ativo</Badge>
  );
}

/** Ambiente exibido: desconectado → Produção por padrão (ou Sandbox se o servidor OAuth for sandbox). */
function resolveMpEnvironmentDisplay(
  connected: boolean,
  availability: Availability | null,
  mpStatus: MpStatus | null
): "sandbox" | "production" | null {
  if (!connected && availability) {
    return availability.oauth_environment === "sandbox" ? "sandbox" : "production";
  }
  return mpStatus?.environment ?? availability?.oauth_environment ?? null;
}

export const MercadoPagoGatewayPanelCard: React.FC<MercadoPagoGatewayPanelCardProps> = ({ item, onStatusChange }) => {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [mpStatus, setMpStatus] = useState<MpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);

  const loadMp = useCallback(async () => {
    const a = await apiClient.get<Availability>(API_AVAILABILITY);
    setAvailability(a.data ?? null);
    if (a.data?.enabled) {
      const s = await apiClient.get<MpStatus>(API_STATUS);
      setMpStatus(s.data ?? null);
    } else {
      setMpStatus(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadMp();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMp]);

  const refreshAll = useCallback(async () => {
    await loadMp();
    onStatusChange?.();
  }, [loadMp, onStatusChange]);

  const statusType = toGatewayStatusType({
    configured: item.configured,
    status: item.status,
    connection_status: item.connection_status,
  });

  const connected = Boolean(mpStatus?.connected);

  const startOAuth = async () => {
    setConnecting(true);
    const res = await apiClient.get<{ url: string }>(API_CONNECT_URL, { cache: "no-store" });
    setConnecting(false);
    if (res.error || !res.data?.url) {
      toast.error(res.error || "Não foi possível iniciar a conexão.");
      return;
    }
    window.location.href = res.data.url;
  };

  const handleTest = async () => {
    setTesting(true);
    const res = await apiClient.post<{ connected: boolean }>(API_TEST, { gateway_key: "mercado_pago" });
    setTesting(false);
    const statusCode = (res as { details?: { status?: number } }).details?.status;
    if (res.error && statusCode === 429) {
      toast.error("Máximo de 5 testes por minuto. Tente novamente em instantes.");
      await refreshAll();
      return;
    }
    if (res.data?.connected) {
      toast.success("Conexão com o Mercado Pago validada.");
    } else {
      toast.error(res.error || "Mercado Pago não conectado ou token inválido.");
    }
    await refreshAll();
  };

  if (loading) {
    return (
      <Card className={gatewayCardClassName("items-center justify-center")}>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Carregando Mercado Pago…</p>
        </CardContent>
      </Card>
    );
  }

  if (!availability?.enabled) {
    return (
      <Card className={gatewayCardClassName("border-dashed border-muted-foreground/25 bg-muted/20")}>
        <CardContent className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Integração Mercado Pago desativada neste ambiente.
        </CardContent>
      </Card>
    );
  }

  const envDisplay = resolveMpEnvironmentDisplay(connected, availability, mpStatus);
  const validationLabel = connected ? formatGatewayLastTest(mpStatus?.last_test_at ?? null) : "Nunca testado";

  return (
    <Card className={gatewayCardClassName()}>
      <CardHeader className="space-y-3 px-5 pb-2 pt-5">
        <div className={gatewayCardIdentityRowClass}>
          <GatewayBrandLogo
            src={MP_LOGO}
            alt="Mercado Pago"
            fallback={<PlugZap className="mx-auto h-5 w-5 text-sky-700 dark:text-sky-300" aria-hidden />}
          />
          <div className={gatewayCardTitleStackClass}>
            <h3 className="text-base font-semibold leading-snug tracking-tight text-foreground break-words">{item.name}</h3>
            <GatewayStatusBadge status={statusType} variant="compact" />
          </div>
        </div>

        <div className={gatewayCardStatusSectionClass}>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ambiente</p>
            <div className="mt-1.5">{envBadgeNode(envDisplay)}</div>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Último teste</p>
            <p className="mt-1.5 text-sm font-medium text-foreground">{validationLabel}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Webhook</p>
            <div className="mt-1.5">{webhookMpLabel(connected)}</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-0">
        <div className={gatewayCardBodyClass}>
          <GatewayFeatureList items={["Checkout Pro", "Pix, cartão e saldo Mercado Pago", "Notificações automáticas"]} />
          <div className={gatewayCardActionsRowClass}>
            {!connected ? (
              <>
                <Button type="button" size="sm" className="gap-2" onClick={() => void startOAuth()} disabled={connecting}>
                  {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Conectar Mercado Pago
                </Button>
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link to="/settings/payments/mercado_pago">
                    <Settings className="mr-2 h-4 w-4" />
                    Configurar
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="default" size="sm" onClick={() => void handleTest()} disabled={testing}>
                  {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Testar conexão
                </Button>
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link to="/settings/payments/mercado_pago">
                    <Settings className="mr-2 h-4 w-4" />
                    Gerenciar conexão
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
