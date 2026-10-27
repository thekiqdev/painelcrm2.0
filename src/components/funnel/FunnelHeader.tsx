
import React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DateFilterPopover } from "./DateFilterPopover";
import { SourceFilter } from "./SourceFilter";
import { useTranslation } from "react-i18next";

interface FunnelHeaderProps {
  onOpenNewFunnelDialog: () => void;
}

export function FunnelHeader({ onOpenNewFunnelDialog }: FunnelHeaderProps) {
  const { t } = useTranslation("crm");
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h1 className="text-2xl font-bold">{t("funnel_title")}</h1>

      <div className="flex flex-col sm:flex-row gap-2">
        {/* Filters */}
        <div className="flex gap-2">
          <DateFilterPopover />
          <SourceFilter />
        </div>

        <Button data-set-new-funnel-dialog onClick={onOpenNewFunnelDialog}>
          <Plus className="mr-2 h-4 w-4" />
          {t("funnel_new")}
        </Button>
      </div>
    </div>
  );
}
