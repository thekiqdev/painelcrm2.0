import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import AddConnectionDialog from "@/components/whatsapp/AddConnectionDialog";
import { InstancesList } from "@/components/whatsapp/InstancesList";
import AdvancedSettings from "@/components/whatsapp/AdvancedSettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings } from "lucide-react";

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

  const handleInstanceCreated = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="instances" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="instances">Instâncias</TabsTrigger>
          <TabsTrigger value="settings">Configurações Avançadas</TabsTrigger>
        </TabsList>
        
        <TabsContent value="instances" className="pt-4">
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
          handleInstanceCreated(); // Recarregar lista após fechar
        }}
        onAddConnection={() => {
          setIsDialogOpen(false);
          handleInstanceCreated(); // Recarregar lista após criar
        }}
      />
    </div>
  );
};

export default WhatsAppSection;
