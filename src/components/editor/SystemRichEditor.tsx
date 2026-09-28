import { useCallback, useEffect, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Quote,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SystemRichEditorProps {
  /** Conteúdo em HTML (controlado). Para resetar conteúdo, use key no componente pai. */
  value: string;
  /** Callback com HTML ao alterar o conteúdo */
  onChange: (html: string) => void;
  /** Placeholder quando vazio */
  placeholder?: string;
  /** Modo somente leitura (toolbar oculta, conteúdo não editável) */
  readOnly?: boolean;
  /** Altura mínima do conteúdo (ex: min-h-[120px]) */
  className?: string;
  /** Id do textarea/editor para acessibilidade */
  id?: string;
}

function getExtensions(placeholderText: string) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
    }),
    Placeholder.configure({ placeholder: placeholderText }),
  ];
}

export function SystemRichEditor({
  value,
  onChange,
  placeholder = "Escreva aqui...",
  readOnly = false,
  className,
  id,
}: SystemRichEditorProps) {
  const extensions = useMemo(() => getExtensions(placeholder), [placeholder]);
  const editor = useEditor({
    extensions,
    content: value || "",
    editable: !readOnly,
    editorProps: {
      attributes: {
        "data-placeholder": placeholder,
        class: "prose prose-sm max-w-none min-h-[80px] px-3 py-2 focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sincronizar valor externo quando mudar (ex.: trocar de projeto no dialog)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const normalized = value || "<p></p>";
    if (current !== normalized) {
      editor.commands.setContent(normalized, false);
    }
  }, [value, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL do link:", previousUrl);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (!editor) {
    return (
      <div
        className={cn(
          "rounded-md border border-input bg-background min-h-[80px] animate-pulse",
          className
        )}
        aria-hidden
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background overflow-hidden",
        className
      )}
      data-readonly={readOnly}
    >
      {!readOnly && (
        <div
          className="flex flex-wrap items-center gap-0.5 border-b border-input bg-muted/40 px-1 py-1"
          role="toolbar"
          aria-label="Formatação do texto"
        >
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive("heading", { level: 1 })}
            title="Título 1"
            aria-label="Título 1"
          >
            <Heading1 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive("heading", { level: 2 })}
            title="Título 2"
            aria-label="Título 2"
          >
            <Heading2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            isActive={editor.isActive("heading", { level: 3 })}
            title="Título 3"
            aria-label="Título 3"
          >
            <Heading3 className="h-4 w-4" />
          </ToolbarButton>
          <Separator />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive("bold")}
            title="Negrito"
            aria-label="Negrito"
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive("italic")}
            title="Itálico"
            aria-label="Itálico"
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            isActive={editor.isActive("underline")}
            title="Sublinhado"
            aria-label="Sublinhado"
          >
            <UnderlineIcon className="h-4 w-4" />
          </ToolbarButton>
          <Separator />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive("bulletList")}
            title="Lista com marcadores"
            aria-label="Lista com marcadores"
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive("orderedList")}
            title="Lista numerada"
            aria-label="Lista numerada"
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive("blockquote")}
            title="Citação"
            aria-label="Citação"
          >
            <Quote className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            isActive={editor.isActive("codeBlock")}
            title="Bloco de código"
            aria-label="Bloco de código"
          >
            <Code className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={setLink}
            isActive={editor.isActive("link")}
            title="Inserir link"
            aria-label="Inserir link"
          >
            <LinkIcon className="h-4 w-4" />
          </ToolbarButton>
        </div>
      )}
      <EditorContent
        editor={editor}
        id={id}
        className={cn(
          "system-rich-editor-content",
          readOnly && "cursor-default"
        )}
      />
    </div>
  );
}

function ToolbarButton({
  onClick,
  isActive,
  title,
  "aria-label": ariaLabel,
  children,
}: {
  onClick: () => void;
  isActive: boolean;
  title: string;
  "aria-label": string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8", isActive && "bg-muted")}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={isActive}
    >
      {children}
    </Button>
  );
}

function Separator() {
  return <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />;
}
