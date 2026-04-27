import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Users } from "lucide-react";
import { CommercialListingPageHeader } from "@/components/listing/CommercialListingPageHeader";

interface LeadHeaderProps {
  searchTerm: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddClick: () => void;
  className?: string;
}

const LeadHeader: React.FC<LeadHeaderProps> = ({ searchTerm, onSearchChange, onAddClick, className }) => {
  return (
    <CommercialListingPageHeader
      className={className}
      eyebrow="Comercial"
      EyebrowIcon={Users}
      title="Leads"
      description="Captação, qualificação, acompanhamento e conversão num só lugar."
      mobilePrimaryAction={{
        label: "Novo lead",
        icon: <Plus className="h-4 w-4" aria-hidden />,
        onClick: onAddClick,
      }}
      belowTitle={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Buscar nome, empresa, e-mail ou telefone…"
              className="h-10 pl-9"
              value={searchTerm}
              onChange={onSearchChange}
              aria-label="Buscar leads"
            />
          </div>
          <div className="hidden md:flex">
            <Button type="button" onClick={onAddClick} className="h-10 shrink-0 touch-manipulation sm:px-4">
              <Plus className="mr-2 h-4 w-4" />
              Novo lead
            </Button>
          </div>
        </div>
      }
    />
  );
};

export default LeadHeader;
