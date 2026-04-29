/**
 * Painel de gateways de pagamento — layout SaaS (resumo + cards Asaas / Mercado Pago).
 * GET /api/me/tenant/payment-gateways/status
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { apiClient } from "@/integrations/api/client";
import { toast } from "@/components/ui/sonner";
import type { GatewayStatusItem } from "@/components/settings/gatewayPanelTypes";
import { GatewaySummaryStrip } from "@/components/settings/GatewaySummaryStrip";
import { AsaasGatewayCard } from "@/components/settings/AsaasGatewayCard";
import { MercadoPagoGatewayPanelCard } from "@/components/settings/MercadoPagoGatewayPanelCard";

const API_STATUS = "/api/me/tenant/payment-gateways/status";

export type { GatewayStatusItem };

export default function PaymentsPanelPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<GatewayStatusItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    const res = await apiClient.get<GatewayStatusItem[]>(API_STATUS);
    if (res.error) {
      toast.error(res.error);
      setItems([]);
    } else if (res.data) {
      setItems(res.data);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadStatus();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadStatus]);

  const enabledGateways = useMemo(() => items.filter((g) => g.is_enabled), [items]);
  const asaasItem = useMemo(() => enabledGateways.find((g) => g.key === "asaas"), [enabledGateways]);
  const mercadoPagoItem = useMemo(() => enabledGateways.find((g) => g.key === "mercado_pago"), [enabledGateways]);

  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-5">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/settings")} className="shrink-0" aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Gateways de pagamento</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:max-w-xl">
            Conecte e gerencie os métodos usados para receber pagamentos dos seus clientes.
          </p>
        </div>
      </div>

      <GatewaySummaryStrip />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando gateways…
        </div>
      ) : enabledGateways.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhum gateway disponível</CardTitle>
            <CardDescription>Nenhum gateway de pagamento está habilitado no momento.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
          {asaasItem ? <AsaasGatewayCard key="asaas" item={asaasItem} onStatusChange={loadStatus} /> : null}
          {mercadoPagoItem ? (
            <MercadoPagoGatewayPanelCard key="mercado_pago" item={mercadoPagoItem} onStatusChange={loadStatus} />
          ) : null}
        </div>
      )}

    </div>
  );
}
