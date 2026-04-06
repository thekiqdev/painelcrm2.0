/**
 * Configuração de um gateway específico (Fase 6 — PLANO-EVOLUCAO-PAYMENT-GATEWAYS-PANEL).
 * Reutiliza PaymentGatewaySection com gatewayKey fixo; 404 se gatewayKey inválido.
 */
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { PaymentGatewaySection } from "@/components/settings/PaymentGatewaySection";
import { apiClient } from "@/integrations/api/client";
import NotFound from "@/pages/NotFound";

const API_GATEWAYS = "/api/me/tenant/payment-gateways";

interface GatewayListItem {
  key: string;
  name: string;
  is_enabled: boolean;
}

export default function GatewayConfigPage() {
  const { gatewayKey } = useParams<{ gatewayKey: string }>();
  const navigate = useNavigate();
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!gatewayKey) {
      setValid(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await apiClient.get<GatewayListItem[]>(API_GATEWAYS);
      if (cancelled) return;
      const list = res.data ?? [];
      const found = list.some((g) => g.key === gatewayKey && g.is_enabled);
      setValid(found);
    })();
    return () => { cancelled = true; };
  }, [gatewayKey]);

  if (!gatewayKey) return <NotFound />;
  if (valid === null) {
    return (
      <div className="container mx-auto py-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando...
      </div>
    );
  }
  if (!valid) return <NotFound />;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/settings/payments")}
          aria-label="Voltar ao painel"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold capitalize">
          Configurar {gatewayKey}
        </h1>
      </div>
      <PaymentGatewaySection gatewayKey={gatewayKey} />
    </div>
  );
}
