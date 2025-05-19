
import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify, Link, Image } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export function RichTextEditor({ value, onChange, className, placeholder }: RichTextEditorProps) {
  const [editorContent, setEditorContent] = useState(value);
  const editorRef = useRef<HTMLDivElement>(null);

  // Apply initial content
  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  // Handle content changes
  const handleContentChange = () => {
    if (editorRef.current) {
      const newContent = editorRef.current.innerHTML;
      setEditorContent(newContent);
      onChange(newContent);
    }
  };

  // Apply formatting to selected text
  const handleFormat = (command: string, value: string | null = null) => {
    document.execCommand(command, false, value);
    handleContentChange();
  };

  // Insert link
  const insertLink = () => {
    const url = prompt('Enter the URL:');
    if (url) {
      document.execCommand('createLink', false, url);
      handleContentChange();
    }
  };

  // Insert image
  const insertImage = () => {
    const url = prompt('Enter the image URL:');
    if (url) {
      document.execCommand('insertImage', false, url);
      handleContentChange();
    }
  };

  return (
    <div className={cn("border rounded-md overflow-hidden", className)}>
      {/* Toolbar */}
      <div className="bg-muted/50 p-1 border-b flex flex-wrap gap-1">
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Negrito"
          onClick={() => handleFormat('bold')}
        >
          <Bold className="h-4 w-4" />
        </button>
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Itálico"
          onClick={() => handleFormat('italic')}
        >
          <Italic className="h-4 w-4" />
        </button>
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Sublinhado"
          onClick={() => handleFormat('underline')}
        >
          <Underline className="h-4 w-4" />
        </button>
        <span className="mx-1 border-r"></span>
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Link"
          onClick={insertLink}
        >
          <Link className="h-4 w-4" />
        </button>
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Imagem"
          onClick={insertImage}
        >
          <Image className="h-4 w-4" />
        </button>
        <span className="mx-1 border-r"></span>
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Lista com marcadores"
          onClick={() => handleFormat('insertUnorderedList')}
        >
          <List className="h-4 w-4" />
        </button>
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Lista numerada"
          onClick={() => handleFormat('insertOrderedList')}
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        <span className="mx-1 border-r"></span>
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Alinhar à esquerda"
          onClick={() => handleFormat('justifyLeft')}
        >
          <AlignLeft className="h-4 w-4" />
        </button>
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Centralizar"
          onClick={() => handleFormat('justifyCenter')}
        >
          <AlignCenter className="h-4 w-4" />
        </button>
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Alinhar à direita"
          onClick={() => handleFormat('justifyRight')}
        >
          <AlignRight className="h-4 w-4" />
        </button>
        <button 
          type="button" 
          className="p-1 hover:bg-muted rounded" 
          title="Justificar"
          onClick={() => handleFormat('justifyFull')}
        >
          <AlignJustify className="h-4 w-4" />
        </button>
      </div>

      {/* Editable content area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleContentChange}
        onBlur={handleContentChange}
        className="w-full p-3 focus:outline-none min-h-[120px] resize-y overflow-auto"
        style={{ direction: "ltr" }}
        data-placeholder={placeholder || "Adicione aqui a descrição detalhada do projeto..."}
      />
    </div>
  );
}
