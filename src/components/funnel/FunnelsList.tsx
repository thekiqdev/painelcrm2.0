
import React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import FunnelsListCard from "./FunnelsListCard";

type Deal = {
  id: string;
  title: string;
  client: string;
  amount: string;
  probability: number;
  dueDate: string;
  stage: string;
  funnelId: string;
};

type FunnelStage = {
  id: string;
  name: string;
  color: string;
  order: number;
  funnelId: string;
};

type FunnelType = "clients" | "leads" | "proposals" | "contracts";

type SalesFunnel = {
  id: string;
  name: string;
  description: string;
  type: FunnelType;
  isDefault: boolean;
  createdAt: string;
  stages: FunnelStage[];
};

interface FunnelsListProps {
  funnels: SalesFunnel[];
  activeFunnelId: string;
  setActiveFunnelId: (id: string) => void;
  handleViewFunnelDetails: (id: string) => void;
  filteredDeals: Deal[];
}

const FunnelsList: React.FC<FunnelsListProps> = ({ 
  funnels, 
  activeFunnelId, 
  setActiveFunnelId, 
  handleViewFunnelDetails,
  filteredDeals
}) => {
  if (funnels.length === 0) {
    return (
      <div className="bg-muted rounded-md flex items-center justify-center p-10">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-medium mb-2">Nenhum funil encontrado</h2>
          <p className="text-muted-foreground mb-4">
            Você ainda não tem nenhum funil deste tipo. Crie um funil para começar a organizar seus negócios.
          </p>
          <Button onClick={() => document.querySelector<HTMLButtonElement>('[data-set-new-funnel-dialog]')?.click()}>
            <Plus className="mr-2 h-4 w-4" />
            Criar Novo Funil
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-muted rounded-md p-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
        <h2 className="text-lg font-semibold">Selecione um funil</h2>
        <span className="text-sm text-muted-foreground">{funnels.length} funis disponíveis</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {funnels.map((funnel) => {
          const dealsForFunnel = filteredDeals.filter(deal => deal.funnelId === funnel.id);
          
          return (
            <FunnelsListCard 
              key={funnel.id}
              id={funnel.id}
              name={funnel.name}
              description={funnel.description}
              isDefault={funnel.isDefault}
              createdAt={funnel.createdAt}
              stagesCount={funnel.stages.length}
              dealsCount={dealsForFunnel.length}
              isActive={activeFunnelId === funnel.id}
              onClick={() => {
                setActiveFunnelId(funnel.id);
                handleViewFunnelDetails(funnel.id);
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export default FunnelsList;
