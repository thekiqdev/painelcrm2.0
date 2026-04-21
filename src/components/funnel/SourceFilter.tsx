
import React, { useState } from "react";
import { Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext"; // Importando o contexto de autenticação

// Lista de opções de fonte
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
  const { user } = useAuth(); // Usando o hook de autenticação para garantir que temos o usuário logado
  
  const handleSourceFilter = (source: string) => {
    if (!user) {
      toast.error("Você precisa estar logado para filtrar dados");
      return;
    }
    
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
