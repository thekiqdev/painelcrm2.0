import { sanitizeHtml } from "@/lib/sanitize";
import { cn } from "@/lib/utils";

export interface SystemRichEditorReadOnlyProps {
  /** Conteúdo em HTML (será sanitizado antes de exibir) */
  html: string;
  /** Classes adicionais no container (ex.: line-clamp-2, text-sm) */
  className?: string;
}

/**
 * Exibe conteúdo rich text em modo somente leitura, com sanitização e estilos padronizados (prose).
 * Use em detalhes de projeto, tarefa, contrato, etc.
 */
export function SystemRichEditorReadOnly({ html, className }: SystemRichEditorReadOnlyProps) {
  if (!html?.trim()) return null;

  const safe = sanitizeHtml(html);

  return (
    <div
      className={cn("prose prose-sm max-w-none text-muted-foreground", className)}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
