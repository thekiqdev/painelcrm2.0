
import React from "react";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";

// Mock data for demonstration purposes
const mockOpportunities = [
  {
    id: "opp1",
    title: "Consultoria em Marketing",
    amount: "R$ 12.500,00",
    stage: "Proposta",
    dueDate: "15/06/2023",
    probability: 65
  },
  {
    id: "opp2",
    title: "Desenvolvimento de Website",
    amount: "R$ 8.200,00",
    stage: "Qualificação",
    dueDate: "22/06/2023",
    probability: 40
  }
];

const LeadOpportunitiesTab: React.FC = () => {
  // Para demonstração, estamos usando dados mockados
  // Em produção, isso seria substituído por dados reais do lead atual
  const opportunities = mockOpportunities;

  return (
    <TabsContent value="opportunities">
      {opportunities.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhuma oportunidade encontrada para este lead.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 mb-4">
          {opportunities.map(opportunity => (
            <Card key={opportunity.id} className="cursor-pointer hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <h4 className="font-medium">{opportunity.title}</h4>
                  <span className="text-sm font-semibold">{opportunity.amount}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <span className="block">Estágio:</span>
                    <span className="font-medium text-foreground">{opportunity.stage}</span>
                  </div>
                  <div>
                    <span className="block">Probabilidade:</span>
                    <span className="font-medium text-foreground">{opportunity.probability}%</span>
                  </div>
                  <div>
                    <span className="block">Data Limite:</span>
                    <span className="font-medium text-foreground">{opportunity.dueDate}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Button className="w-full">
        <Plus className="mr-2 h-4 w-4" />
        Adicionar Oportunidade
      </Button>
    </TabsContent>
  );
};

export default LeadOpportunitiesTab;
