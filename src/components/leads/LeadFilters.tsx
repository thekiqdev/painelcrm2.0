
import React, { useMemo } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";

interface LeadFiltersProps {
  activeStatusFilter: string;
  setActiveStatusFilter: (value: string) => void;
  leadStatuses: any[];
}

const LeadFilters: React.FC<LeadFiltersProps> = ({
  activeStatusFilter,
  setActiveStatusFilter,
  leadStatuses,
}) => {
  /** Ordem fixa: Todos → Novos → demais status (exc. Convertido) → Convertidos (última). */
  const middleStatuses = useMemo(
    () =>
      (leadStatuses || []).filter((s) => {
        const n = (s.name || "").toLowerCase();
        return n !== "novo" && n !== "convertido";
      }),
    [leadStatuses]
  );

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
      <Tabs 
        value={activeStatusFilter} 
        onValueChange={setActiveStatusFilter}
      >
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="novo">Novos</TabsTrigger>
          {middleStatuses.map((status) => (
            <TabsTrigger key={status.id} value={status.name.toLowerCase()}>
              <div className="flex items-center gap-2">
                <div 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: status.color }} 
                />
                {status.name}
              </div>
            </TabsTrigger>
          ))}
          <TabsTrigger value="convertidos">Convertidos</TabsTrigger>
        </TabsList>
      </Tabs>

      <Button variant="outline" size="sm">
        <Filter className="h-4 w-4 mr-2" />
        Filtros
      </Button>
    </div>
  );
};

export default LeadFilters;
