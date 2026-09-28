import React, { useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ChecklistItem } from "@/services/tasks";

export interface TaskChecklistEditorProps {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  className?: string;
  disabled?: boolean;
}

export function TaskChecklistEditor({
  items,
  onChange,
  className,
  disabled = false,
}: TaskChecklistEditorProps) {
  const [draft, setDraft] = useState("");

  const completed = items.filter((i) => i.completed).length;
  const total = items.length;

  const addItem = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    onChange([
      ...items,
      { id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, completed: false },
    ]);
    setDraft("");
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-semibold">Checklist</Label>
        {total > 0 ? (
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {completed}/{total} concluídos
          </span>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Adicionar item"
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={addItem}
          disabled={disabled || !draft.trim()}
          aria-label="Adicionar item ao checklist"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <ul className="space-y-1 text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 rounded-md py-1 pr-1">
            <Checkbox
              checked={item.completed}
              disabled={disabled}
              onCheckedChange={(c) =>
                onChange(
                  items.map((x) => (x.id === item.id ? { ...x, completed: Boolean(c) } : x))
                )
              }
            />
            <span className={cn("flex-1 min-w-0", item.completed && "line-through text-muted-foreground")}>
              {item.text}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              disabled={disabled}
              onClick={() => onChange(items.filter((x) => x.id !== item.id))}
              aria-label="Remover item"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
