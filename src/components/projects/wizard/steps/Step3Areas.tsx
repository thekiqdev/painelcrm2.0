import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardSpecificConfig } from "../types";

interface Step3AreasProps {
  config: WizardSpecificConfig;
  onChange: (partial: Partial<WizardSpecificConfig>) => void;
}

export function Step3Areas({ config, onChange }: Step3AreasProps) {
  const [createAreasNow, setCreateAreasNow] = useState(
    config.areas !== undefined && config.areas.length > 0
  );
  const areas = config.areas ?? [];

  const handleToggle = (now: boolean) => {
    setCreateAreasNow(now);
    if (!now) onChange({ areas: [] });
    else if ((config.areas ?? []).length === 0) onChange({ areas: [""] });
  };

  const addArea = () => {
    onChange({ areas: [...areas, ""] });
  };

  const updateArea = (index: number, value: string) => {
    const next = [...areas];
    next[index] = value;
    onChange({ areas: next });
  };

  const removeArea = (index: number) => {
    onChange({ areas: areas.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Você pode definir áreas iniciais (times ou domínios) agora ou depois no projeto.
      </p>
      <div className="space-y-3">
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="areas-option"
              checked={createAreasNow}
              onChange={() => handleToggle(true)}
              className="rounded-full border-input"
            />
            <span>Criar áreas agora</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="areas-option"
              checked={!createAreasNow}
              onChange={() => handleToggle(false)}
              className="rounded-full border-input"
            />
            <span>Criar áreas depois</span>
          </label>
        </div>
        {createAreasNow && (
          <div className="space-y-2 rounded-md border p-4">
            <Label>Nomes das áreas</Label>
            {areas.map((name, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={name}
                  onChange={(e) => updateArea(i, e.target.value)}
                  placeholder="Ex.: Front-end, Back-end"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeArea(i)}
                  aria-label="Remover área"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addArea}>
              <Plus className="mr-1 h-4 w-4" />
              Adicionar área
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
