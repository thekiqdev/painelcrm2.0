import React, { useState } from "react";
import { X, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface StickyNoteData {
  id: string;
  content: string;
  color: string;
  position?: { x: number; y: number };
  created_at?: string;
  updated_at?: string;
}

interface StickyNoteProps {
  note: StickyNoteData;
  onUpdate: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onColorChange?: (id: string, color: string) => void;
}

const noteColors = [
  { name: "Amarelo", value: "bg-yellow-200", border: "border-yellow-300" },
  { name: "Rosa", value: "bg-pink-200", border: "border-pink-300" },
  { name: "Azul", value: "bg-blue-200", border: "border-blue-300" },
  { name: "Verde", value: "bg-green-200", border: "border-green-300" },
  { name: "Roxo", value: "bg-purple-200", border: "border-purple-300" },
  { name: "Laranja", value: "bg-orange-200", border: "border-orange-300" },
];

export const StickyNote: React.FC<StickyNoteProps> = ({
  note,
  onUpdate,
  onDelete,
  onColorChange,
}) => {
  // Se a nota estiver vazia, abrir em modo de edição
  const [isEditing, setIsEditing] = useState(!note.content || note.content.trim() === "");
  const [editContent, setEditContent] = useState(note.content);
  const [isHovered, setIsHovered] = useState(false);

  const colorClass = noteColors.find(c => c.value === note.color) || noteColors[0];

  const handleSave = () => {
    if (editContent.trim()) {
      onUpdate(note.id, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditContent(note.content);
    setIsEditing(false);
  };

  return (
    <div
      className={cn(
        "relative p-4 rounded-lg shadow-md transition-all duration-200 min-h-[150px] max-w-[250px]",
        /* Post-it: cores pastel fixas + texto escuro (não herdar foreground do dark) */
        "text-zinc-950 [color-scheme:light]",
        colorClass.value,
        colorClass.border,
        "border-2",
        isHovered && "shadow-lg scale-105"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={note.position ? { position: "absolute", left: note.position.x, top: note.position.y } : {}}
    >
      {/* Botões de ação - aparecem no hover */}
      <div className={cn(
        "absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity",
        isHovered && "opacity-100"
      )}>
        {onColorChange && (
          <select
            className="text-xs bg-white/80 rounded px-1 py-0.5 border border-gray-300"
            value={note.color}
            onChange={(e) => onColorChange(note.id, e.target.value)}
            onClick={(e) => e.stopPropagation()}
          >
            {noteColors.map(color => (
              <option key={color.value} value={color.value}>{color.name}</option>
            ))}
          </select>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-zinc-800 hover:bg-black/10 hover:text-zinc-950"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
        >
          <Edit2 className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-red-700 hover:bg-red-500/10 hover:text-red-800"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(note.id);
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Conteúdo */}
      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[100px] resize-none border-zinc-400 bg-white/95 text-zinc-950 caret-zinc-950 placeholder:text-zinc-500 focus-visible:ring-zinc-400 dark:bg-white dark:text-zinc-950 dark:placeholder:text-zinc-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") handleCancel();
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSave();
            }}
          />
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCancel}
              className="border-input bg-background text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground"
            >
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={handleSave}>
              Salvar
            </Button>
          </div>
        </div>
      ) : (
        <div className="pt-6">
          <p className="text-sm whitespace-pre-wrap break-words text-zinc-950">
            {note.content || "Nota vazia"}
          </p>
        </div>
      )}
    </div>
  );
};

export default StickyNote;

