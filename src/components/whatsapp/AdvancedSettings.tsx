
import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EvolutionApiConfigComponent from "./EvolutionApiConfig";
import EvolutionServerConfigComponent from "./EvolutionServerConfig";

export const AdvancedSettings = () => {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="servers" className="w-full">
        <TabsList>
          <TabsTrigger value="servers">Servidores</TabsTrigger>
          <TabsTrigger value="configs">Configurações</TabsTrigger>
        </TabsList>
        
        <TabsContent value="servers" className="pt-4">
          <EvolutionServerConfigComponent />
        </TabsContent>
        
        <TabsContent value="configs" className="pt-4">
          <EvolutionApiConfigComponent />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdvancedSettings;
