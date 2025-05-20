
import React from "react";
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
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
      <Tabs 
        value={activeStatusFilter} 
        onValueChange={setActiveStatusFilter}
      >
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          {leadStatuses.map(status => (
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
