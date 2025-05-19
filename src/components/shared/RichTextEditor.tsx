import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export function RichTextEditor({ value, onChange, className, placeholder }: RichTextEditorProps) {
  const [html, setHtml] = useState(value);
  
  // Reference to the editor element
  const editorRef = React.useRef<HTMLDivElement>(null);
  
  // Update the editor content when the value prop changes
  useEffect(() => {
    if (editorRef.current && value !== html) {
      editorRef.current.innerHTML = value;
      setHtml(value);
    }
  }, [value]);
  
  // Ensure correct text direction
  useEffect(() => {
    if (editorRef.current) {
      // Force LTR direction on the contentEditable element
      editorRef.current.setAttribute('dir', 'ltr');
      
      // Set writing mode properties
      editorRef.current.style.unicodeBidi = 'bidi-override';
      editorRef.current.style.textAlign = 'left';
    }
  }, []);
  
  const applyFormatting = (command: string, value: string | null = null) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      const newContent = editorRef.current.innerHTML;
      setHtml(newContent);
      onChange(newContent);
    }
  };
  
  const handleEditorChange = () => {
    if (editorRef.current) {
      const newContent = editorRef.current.innerHTML;
      setHtml(newContent);
      onChange(newContent);
    }
  };

  return (
    <div className={cn("border rounded-md overflow-hidden", className)}>
      <div className="bg-muted/50 p-1 border-b flex flex-wrap gap-1">
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Negrito"
          onClick={() => applyFormatting('bold')}
        >
          <Bold className="h-4 w-4" />
        </button>
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Itálico"
          onClick={() => applyFormatting('italic')}
        >
          <Italic className="h-4 w-4" />
        </button>
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Sublinhado"
          onClick={() => applyFormatting('underline')}
        >
          <Underline className="h-4 w-4" />
        </button>
        <span className="mx-1 border-r"></span>
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Lista com marcadores"
          onClick={() => applyFormatting('insertUnorderedList')}
        >
          <List className="h-4 w-4" />
        </button>
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Lista numerada"
          onClick={() => applyFormatting('insertOrderedList')}
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        <span className="mx-1 border-r"></span>
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Alinhar à esquerda"
          onClick={() => applyFormatting('justifyLeft')}
        >
          <AlignLeft className="h-4 w-4" />
        </button>
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Centralizar"
          onClick={() => applyFormatting('justifyCenter')}
        >
          <AlignCenter className="h-4 w-4" />
        </button>
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Alinhar à direita"
          onClick={() => applyFormatting('justifyRight')}
        >
          <AlignRight className="h-4 w-4" />
        </button>
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Justificar"
          onClick={() => applyFormatting('justifyFull')}
        >
          <AlignJustify className="h-4 w-4" />
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        dangerouslySetInnerHTML={{ __html: html }}
        onInput={handleEditorChange}
        className={cn(
          "w-full p-3 focus:outline-none min-h-[120px] resize-y overflow-auto",
          !html && "before:content-[attr(data-placeholder)] before:text-gray-400"
        )}
        data-placeholder={placeholder || "Adicione aqui a descrição detalhada do projeto..."}
        dir="ltr" // Ensure left-to-right text direction
        style={{
          unicodeBidi: 'plaintext', // Use plaintext for bidirectional algorithm
          textAlign: 'left'
        }}
      />
    </div>
  );
}
