
import React from 'react';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function RichTextEditor({ value, onChange, className }: RichTextEditorProps) {
  // Implementação básica - em produção, integraria uma biblioteca como TipTap ou Quill
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className={cn("border rounded-md overflow-hidden", className)}>
      <div className="bg-muted/50 p-1 border-b flex gap-1">
        <button type="button" className="p-1 hover:bg-muted rounded" title="Negrito">
          <strong>B</strong>
        </button>
        <button type="button" className="p-1 hover:bg-muted rounded" title="Itálico">
          <em>I</em>
        </button>
        <button type="button" className="p-1 hover:bg-muted rounded" title="Sublinhado">
          <u>U</u>
        </button>
        <span className="mx-1 border-r"></span>
        <button type="button" className="p-1 hover:bg-muted rounded" title="Lista com marcadores">
          • Lista
        </button>
        <button type="button" className="p-1 hover:bg-muted rounded" title="Lista numerada">
          1. Lista
        </button>
        <span className="mx-1 border-r"></span>
        <button type="button" className="p-1 hover:bg-muted rounded" title="Alinhar à esquerda">
          ⫷⫷
        </button>
        <button type="button" className="p-1 hover:bg-muted rounded" title="Centralizar">
          ⟺
        </button>
        <button type="button" className="p-1 hover:bg-muted rounded" title="Alinhar à direita">
          ⫸⫸
        </button>
      </div>
      <textarea
        value={value}
        onChange={handleChange}
        className="w-full p-3 focus:outline-none min-h-[120px] resize-y"
        placeholder="Adicione aqui a descrição detalhada do projeto..."
      />
    </div>
  );
}
