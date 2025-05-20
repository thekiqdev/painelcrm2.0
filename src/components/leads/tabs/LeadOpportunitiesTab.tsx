
import React from "react";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const LeadOpportunitiesTab: React.FC = () => {
  return (
    <TabsContent value="opportunities">
      <p className="text-sm text-muted-foreground text-center py-6">
        Nenhuma oportunidade encontrada para este lead.
      </p>
      <Button className="w-full">
        <Plus className="mr-2 h-4 w-4" />
        Adicionar Oportunidade
      </Button>
    </TabsContent>
  );
};

export default LeadOpportunitiesTab;
