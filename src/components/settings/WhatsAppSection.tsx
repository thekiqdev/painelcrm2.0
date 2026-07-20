import React, { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import AddConnectionDialog from "@/components/whatsapp/AddConnectionDialog";
import { InstancesList } from "@/components/whatsapp/InstancesList";
import AdvancedSettings from "@/components/whatsapp/AdvancedSettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  getTenantLimits,
  type TenantLimitsWhatsAppInstances,
} from "@/services/tenantLimits";

export const WhatsAppSection = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("instances");
  const [refreshKey, setRefreshKey] = useState(0);
  const [waLimit, setWaLimit] = useState<TenantLimitsWhatsAppInstances | null>(null);

  const refreshLimits = useCallback(() => {
    getTenantLimits().then((limits) => {
      if (limits?.whatsapp_instances) setWaLimit(limits.whatsapp_instances);
    });
  }, []);

  useEffect(() => {
    refreshLimits();
  }, [refreshLimits, refreshKey]);

  useEffect(() => {
    const raw = searchParams.get("openAddConnection");
    if (raw !== "1" && raw !== "true") return;
    setIsDialogOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("openAddConnection");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const onTabChange = (v: string) => {
    setActiveTab(v);
  };

  const handleInstanceCreated = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const atLimit = waLimit?.limit != null && !waLimit.allowed;
  const limitLabel =
    waLimit?.limit != null
      ? `${waLimit.current} de ${waLimit.limit} conexões`
      : waLimit != null
        ? `${waLimit.current} conexões`
        : null;

  const openAdd = () => {
    if (atLimit) return;
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 space-y-1.5">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">WhatsApp</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            Conecte seu WhatsApp para atender clientes diretamente pela plataforma.
          </p>
          {limitLabel ? (
            <p className="text-sm text-muted-foreground">
              Uso do plano: <span className="font-medium text-foreground">{limitLabel}</span>
              {waLimit?.limit == null ? " (ilimitado)" : null}
            </p>
          ) : null}
        </div>
        {activeTab === "instances" && (
          <Button
            onClick={openAdd}
            className="h-11 w-full shrink-0 gap-2 sm:w-auto"
            size="default"
            type="button"
            disabled={atLimit}
            title={atLimit ? "Limite de conexões do plano atingido" : undefined}
          >
            <Plus className="h-4 w-4" />
            Nova instância
          </Button>
        )}
      </div>

      {atLimit ? (
        <Alert>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Limite de conexões WhatsApp do plano atingido ({limitLabel}). Para adicionar mais,
              aumente o limite no Meu Plano.
            </span>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link to="/meu-plano">Ir para Meu Plano</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
        <TabsList className="h-11 w-full justify-start sm:w-auto">
          <TabsTrigger value="instances" className="px-4">
            Conexões
          </TabsTrigger>
          <TabsTrigger value="settings" className="px-4">
            Configurações avançadas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="instances" className="pt-2 md:pt-4">
          <InstancesList
            key={refreshKey}
            onAddInstance={openAdd}
            onInstanceCreated={handleInstanceCreated}
            canAddInstance={!atLimit}
            limitLabel={limitLabel}
          />
        </TabsContent>

        <TabsContent value="settings" className="pt-4">
          <AdvancedSettings />
        </TabsContent>
      </Tabs>

      <AddConnectionDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          handleInstanceCreated();
        }}
        onAddConnection={() => {
          setIsDialogOpen(false);
          handleInstanceCreated();
        }}
        limitReached={atLimit}
        limitLabel={limitLabel}
      />
    </div>
  );
};

export default WhatsAppSection;
