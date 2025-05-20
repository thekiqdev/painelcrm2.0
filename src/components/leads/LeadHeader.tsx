
import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";

interface LeadHeaderProps {
  searchTerm: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddClick: () => void;
}

const LeadHeader: React.FC<LeadHeaderProps> = ({
  searchTerm,
  onSearchChange,
  onAddClick,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
      <h1 className="text-2xl font-bold">Leads</h1>
      <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar leads..."
            className="pl-8 w-full sm:w-[250px]"
            value={searchTerm}
            onChange={onSearchChange}
          />
        </div>
        <Button onClick={onAddClick}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Lead
        </Button>
      </div>
    </div>
  );
};

export default LeadHeader;
