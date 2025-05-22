
import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FunnelType, SalesFunnel, Deal } from "@/components/funnel/types";
import FunnelsList from "@/components/funnel/FunnelsList";

interface FunnelTabsProps {
  activeTab: FunnelType;
  setActiveTab: (value: FunnelType) => void;
  funnels: SalesFunnel[];
  activeFunnelId: string;
  setActiveFunnelId: (id: string) => void;
  handleViewFunnelDetails: (id: string) => void;
  filteredDeals: Deal[];
  isLoading: boolean;
}

export function FunnelTabs({
  activeTab,
  setActiveTab,
  funnels,
  activeFunnelId,
  setActiveFunnelId,
  handleViewFunnelDetails,
  filteredDeals,
  isLoading
}: FunnelTabsProps) {
  // Filtrar funis pelo tipo ativo
  const funnelsByType = funnels.filter(f => f.type === activeTab);

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as FunnelType)}>
      <TabsList className="mb-4">
        <TabsTrigger value="clients">Clientes</TabsTrigger>
        <TabsTrigger value="leads">Leads</TabsTrigger>
        <TabsTrigger value="proposals">Propostas</TabsTrigger>
        <TabsTrigger value="contracts">Contratos</TabsTrigger>
      </TabsList>

      {/* Loading state */}
      {isLoading ? (
        <div className="bg-muted rounded-md p-8 flex items-center justify-center">
          <p className="text-muted-foreground">Carregando funis...</p>
        </div>
      ) : (
        <>
          {/* Conteúdo para todos os tipos de funis */}
          <TabsContent value="clients" className="space-y-4">
            <FunnelsList 
              funnels={funnelsByType} 
              activeFunnelId={activeFunnelId}
              setActiveFunnelId={setActiveFunnelId}
              handleViewFunnelDetails={handleViewFunnelDetails}
              filteredDeals={filteredDeals.filter(deal => deal.funnelId === activeFunnelId)}
            />
          </TabsContent>
          <TabsContent value="leads" className="space-y-4">
            <FunnelsList 
              funnels={funnelsByType} 
              activeFunnelId={activeFunnelId}
              setActiveFunnelId={setActiveFunnelId}
              handleViewFunnelDetails={handleViewFunnelDetails}
              filteredDeals={filteredDeals.filter(deal => deal.funnelId === activeFunnelId)}
            />
          </TabsContent>
          <TabsContent value="proposals" className="space-y-4">
            <FunnelsList 
              funnels={funnelsByType} 
              activeFunnelId={activeFunnelId}
              setActiveFunnelId={setActiveFunnelId}
              handleViewFunnelDetails={handleViewFunnelDetails}
              filteredDeals={filteredDeals.filter(deal => deal.funnelId === activeFunnelId)}
            />
          </TabsContent>
          <TabsContent value="contracts" className="space-y-4">
            <FunnelsList 
              funnels={funnelsByType} 
              activeFunnelId={activeFunnelId}
              setActiveFunnelId={setActiveFunnelId}
              handleViewFunnelDetails={handleViewFunnelDetails}
              filteredDeals={filteredDeals.filter(deal => deal.funnelId === activeFunnelId)}
            />
          </TabsContent>
        </>
      )}
    </Tabs>
  );
}
