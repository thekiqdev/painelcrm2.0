import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Users, Upload } from "lucide-react";
import { CommercialListingPageHeader } from "@/components/listing/CommercialListingPageHeader";

interface LeadHeaderProps {
  searchTerm: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddClick: () => void;
  /** Importar CSV (mesma permissão que criar lead). */
  canImport?: boolean;
  importRunning?: boolean;
  onImportClick?: () => void;
  className?: string;
}

const LeadHeader: React.FC<LeadHeaderProps> = ({
  searchTerm,
  onSearchChange,
  onAddClick,
  canImport = false,
  importRunning = false,
  onImportClick,
  className,
}) => {
  return (
    <CommercialListingPageHeader
      className={className}
      eyebrow="Comercial"
      EyebrowIcon={Users}
      title="Leads"
      description="Captação, qualificação, acompanhamento e conversão num só lugar."
      mobileSecondarySlot={
        canImport && onImportClick ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 touch-manipulation text-muted-foreground hover:text-foreground"
            disabled={importRunning}
            aria-label="Importar leads (CSV)"
            onClick={onImportClick}
          >
            <Upload className="h-4 w-4" aria-hidden />
          </Button>
        ) : null
      }
      mobilePrimaryAction={{
        label: "Novo lead",
        icon: <Plus className="h-4 w-4" aria-hidden />,
        onClick: onAddClick,
      }}
      belowTitle={
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2 md:flex-nowrap">
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
          {canImport && onImportClick ? (
            <Button
              type="button"
              variant="outline"
              className="hidden h-10 shrink-0 gap-2 px-3 md:inline-flex"
              disabled={importRunning}
              onClick={onImportClick}
            >
              <Upload className="h-4 w-4 shrink-0" aria-hidden />
              Importar
            </Button>
          ) : null}
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
