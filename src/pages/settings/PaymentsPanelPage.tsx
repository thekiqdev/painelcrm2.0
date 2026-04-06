/**
 * Painel de gateways de pagamento (Fase 6/7 — PLANO-EVOLUCAO-PAYMENT-GATEWAYS-PANEL).
 * GET .../payment-gateways/status → grid de PaymentGatewayCard (badge, último teste, webhook, testar).
 */
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, ArrowLeft, Loader2 } from "lucide-react";
import { apiClient } from "@/integrations/api/client";
import { toast } from "sonner";
import { PaymentGatewayCard, type GatewayStatusItem } from "@/components/settings/PaymentGatewayCard";

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
    return () => { cancelled = true; };
  }, [loadStatus]);

  const enabledGateways = items.filter((g) => g.is_enabled);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/settings")} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-7 w-7" />
            Gateways de pagamento
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure e gerencie os gateways para cobrança de clientes.
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            Após salvar as credenciais, clique em <strong>Testar conexão</strong> no card do gateway para ativá-lo e poder emitir faturas para clientes.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : enabledGateways.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhum gateway disponível</CardTitle>
            <CardDescription>
              Nenhum gateway de pagamento está habilitado no momento.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enabledGateways.map((item) => (
            <PaymentGatewayCard
              key={item.key}
              item={item}
              onStatusChange={loadStatus}
            />
          ))}
        </div>
      )}
    </div>
  );
}
