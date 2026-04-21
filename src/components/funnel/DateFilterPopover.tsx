
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/components/ui/sonner";

export function DateFilterPopover() {
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  // Handle date filter changes
  const handleDateFilter = () => {
    // Implementation would filter clients based on date range
    toast.info(`Filtrando por data: ${startDate ? format(startDate, 'dd/MM/yyyy') : 'Início'} até ${endDate ? format(endDate, 'dd/MM/yyyy') : 'Hoje'}`);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Calendar className="h-4 w-4 mr-2" />
          Filtrar por Data
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="p-4 space-y-4">
          <div>
            <Label>Data Inicial</Label>
            <CalendarComponent
              mode="single"
              selected={startDate}
              onSelect={setStartDate}
              locale={ptBR}
              className="rounded-md border mt-2"
            />
          </div>
          <div>
            <Label>Data Final</Label>
            <CalendarComponent
              mode="single"
              selected={endDate}
              onSelect={setEndDate}
              locale={ptBR}
              className="rounded-md border mt-2"
            />
          </div>
          <Button className="w-full" onClick={handleDateFilter}>Aplicar Filtro</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
