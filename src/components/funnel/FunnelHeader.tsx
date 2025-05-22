
import React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DateFilterPopover } from "./DateFilterPopover";
import { SourceFilter } from "./SourceFilter";

interface FunnelHeaderProps {
  onOpenNewFunnelDialog: () => void;
}

export function FunnelHeader({ onOpenNewFunnelDialog }: FunnelHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h1 className="text-2xl font-bold">Funil de Vendas</h1>

      <div className="flex flex-col sm:flex-row gap-2">
        {/* Filters */}
        <div className="flex gap-2">
          <DateFilterPopover />
          <SourceFilter />
        </div>

        <Button data-set-new-funnel-dialog onClick={onOpenNewFunnelDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Funil
        </Button>
      </div>
    </div>
  );
}
