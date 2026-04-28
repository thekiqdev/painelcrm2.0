import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import AddConnectionDialog from "@/components/whatsapp/AddConnectionDialog";
import { InstancesList } from "@/components/whatsapp/InstancesList";
import AdvancedSettings from "@/components/whatsapp/AdvancedSettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export const WhatsAppSection = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("instances");
  const [refreshKey, setRefreshKey] = useState(0);

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

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 space-y-1.5">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">WhatsApp</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            Conecte seu WhatsApp para atender clientes diretamente pela plataforma.
          </p>
        </div>
        {activeTab === "instances" && (
          <Button
            onClick={() => setIsDialogOpen(true)}
            className="h-11 w-full shrink-0 gap-2 sm:w-auto"
            size="default"
            type="button"
          >
            <Plus className="h-4 w-4" />
            Nova instância
          </Button>
        )}
      </div>

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
            onAddInstance={() => setIsDialogOpen(true)}
            onInstanceCreated={handleInstanceCreated}
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
      />
    </div>
  );
};

export default WhatsAppSection;
