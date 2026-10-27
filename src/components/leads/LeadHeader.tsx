import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Users, Upload } from "lucide-react";
import { CommercialListingPageHeader } from "@/components/listing/CommercialListingPageHeader";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("crm");
  return (
    <CommercialListingPageHeader
      className={className}
      eyebrow={t("leads_eyebrow")}
      EyebrowIcon={Users}
      title={t("leads_title")}
      description={t("leads_desc")}
      mobileSecondarySlot={
        canImport && onImportClick ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 touch-manipulation text-muted-foreground hover:text-foreground"
            disabled={importRunning}
            aria-label={t("leads_import_csv")}
            onClick={onImportClick}
          >
            <Upload className="h-4 w-4" aria-hidden />
          </Button>
        ) : null
      }
      mobilePrimaryAction={{
        label: t("leads_new"),
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
              placeholder={t("leads_search")}
              className="h-10 pl-9"
              value={searchTerm}
              onChange={onSearchChange}
              aria-label={t("leads_search_label")}
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
              {t("leads_import")}
            </Button>
          ) : null}
          <div className="hidden md:flex">
            <Button type="button" onClick={onAddClick} className="h-10 shrink-0 touch-manipulation sm:px-4">
              <Plus className="mr-2 h-4 w-4" />
              {t("leads_new")}
            </Button>
          </div>
        </div>
      }
    />
  );
};

export default LeadHeader;
