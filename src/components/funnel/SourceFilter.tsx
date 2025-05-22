
import React, { useState } from "react";
import { Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

// List of source options
const sourceOptions = [
  { value: "all", label: "Todas as fontes" },
  { value: "Website", label: "Website" },
  { value: "Indicação", label: "Indicação" },
  { value: "Mídia Social", label: "Mídia Social" },
  { value: "Email Marketing", label: "Email Marketing" },
  { value: "Google", label: "Google" },
  { value: "Evento", label: "Evento" },
  { value: "Outros", label: "Outros" }
];

export function SourceFilter() {
  const [selectedSource, setSelectedSource] = useState<string>("all");
  
  const handleSourceFilter = (source: string) => {
    setSelectedSource(source);
    toast.info(`Filtrando por fonte: ${source === "all" ? 'Todas' : source}`);
  };

  return (
    <Select value={selectedSource} onValueChange={handleSourceFilter}>
      <SelectTrigger className="w-[180px]">
        <div className="flex items-center">
          <Filter className="h-4 w-4 mr-2" />
          <SelectValue placeholder="Fonte" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {sourceOptions.map(option => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
