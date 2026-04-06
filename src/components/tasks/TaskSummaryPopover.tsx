import React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { UnifiedTask } from "@/lib/taskUnified";
import { TaskSummaryContent } from "./TaskSummaryContent";

export interface TaskSummaryPopoverProps {
  task: UnifiedTask;
  /** Chamado ao clicar em "Abrir por completo"; pode fechar o popover e abrir a janela completa. */
  onOpenFull: () => void;
  /** Controla abertura (controlado). */
  open?: boolean;
  /** Callback quando abertura/fechamento muda (controlado). */
  onOpenChange?: (open: boolean) => void;
  /** Trigger do popover (ex.: UnifiedTaskCard). */
  children: React.ReactNode;
  /** Classe no conteúdo do popover. */
  contentClassName?: string;
}

/**
 * Popover de resumo da tarefa. O filho (ex.: card) é o trigger; ao clicar, abre o resumo
 * com botão "Abrir por completo". Use open/onOpenChange para controlar e fechar ao abrir a view completa.
 */
export function TaskSummaryPopover({
  task,
  onOpenFull,
  open,
  onOpenChange,
  children,
  contentClassName,
}: TaskSummaryPopoverProps) {
  const handleOpenFull = () => {
    onOpenChange?.(false);
    onOpenFull();
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Ver resumo da tarefa: ${task.title}. Pressione Enter ou Espaço para abrir. Escape para fechar.`}
          className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
        >
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className={contentClassName ?? "w-80 sm:w-96 max-h-[70vh] overflow-y-auto p-4"}
        align="start"
        sideOffset={8}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Resumo da tarefa: ${task.title}`}
      >
        <TaskSummaryContent task={task} onOpenFull={handleOpenFull} />
      </PopoverContent>
    </Popover>
  );
}
