import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CHAT_OUTGOING_FILE_MAX_BYTES,
  classifyChatOutgoingFile,
  validateChatOutgoingFileSize,
} from '@/utils/chatComposerOutgoingFile';
import { toast } from 'sonner';
import { useChatPerfRender } from '@/features/chat-core/metrics/renderMetrics';

type Props = {
  children: ReactNode;
  /** Desliga drag-and-drop (ex.: mobile ou sem conversa) */
  disabled?: boolean;
  /**
   * Chamado com ficheiros válidos (um de cada vez na prática).
   * O pai decide enviar como imagem ou documento.
   */
  onSendImageFile: (file: File) => void | Promise<void>;
  onSendDocumentFile: (file: File) => void | Promise<void>;
  className?: string;
};

export function ChatComposerDropZone({
  children,
  disabled = false,
  onSendImageFile,
  onSendDocumentFile,
  className,
}: Props) {
  useChatPerfRender('Composer');
  const [dragActive, setDragActive] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      if (!e.dataTransfer.types.includes('Files')) return;
      dragCounter.current += 1;
      setDragActive(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragActive(false);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    [disabled],
  );

  const routeFile = useCallback(
    async (file: File) => {
      const sizeOk = validateChatOutgoingFileSize(file);
      if (!sizeOk.ok) {
        toast.error(sizeOk.message);
        return;
      }
      const kind = classifyChatOutgoingFile(file);
      if (!kind) {
        toast.error('Tipo de arquivo não suportado para envio pelo WhatsApp.');
        return;
      }
      try {
        if (kind === 'image') {
          await Promise.resolve(onSendImageFile(file));
        } else {
          await Promise.resolve(onSendDocumentFile(file));
        }
      } catch {
        /* toast no pai */
      }
    },
    [onSendDocumentFile, onSendImageFile],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      dragCounter.current = 0;
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length === 0) return;
      for (const file of files) {
        await routeFile(file);
      }
    },
    [disabled, routeFile],
  );

  return (
    <div
      className={cn('relative flex min-h-0 min-w-0 flex-1 flex-col', className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {dragActive && !disabled ? (
        <div
          className="pointer-events-none absolute inset-0 z-[60] flex items-center justify-center rounded-lg border-2 border-dashed border-primary/50 bg-background/80 backdrop-blur-[2px] md:rounded-md"
          aria-hidden
        >
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <Upload className="h-10 w-10 text-primary" strokeWidth={1.5} />
            <p className="text-sm font-semibold text-foreground">Solte para anexar à conversa</p>
            <p className="max-w-[240px] text-xs text-muted-foreground">
              Imagens ou documentos até {(CHAT_OUTGOING_FILE_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
