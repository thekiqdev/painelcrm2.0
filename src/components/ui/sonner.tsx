import { useTheme } from "next-themes";
import { Toaster as Sonner, toast as sonnerToast, type ExternalToast } from "sonner";
import type { ComponentProps, ReactNode } from "react";

type ToasterProps = ComponentProps<typeof Sonner>;

/**
 * Alinhado ao header principal do AppLayout (`h-16` = 4rem) + margem + safe area (mobile).
 */
export const TOAST_OFFSET_TOP =
  "calc(4rem + 0.75rem + env(safe-area-inset-top, 0px))";

const TOAST_DURATION_MS = {
  success: 3000,
  warning: 4000,
  error: 5000,
  info: 4000,
  default: 3500,
} as const;

function withPresetDuration(
  preset: keyof typeof TOAST_DURATION_MS,
  data?: ExternalToast
): ExternalToast | undefined {
  if (data && data.duration !== undefined) {
    return data;
  }
  return { ...(data ?? {}), duration: TOAST_DURATION_MS[preset] };
}

/**
 * Toast padronizado: durações por tipo (sucesso / aviso / erro / info).
 * Importar sempre de `@/components/ui/sonner`, não de `sonner` diretamente.
 */
export const toast = Object.assign(
  (message: ReactNode, data?: ExternalToast) =>
    sonnerToast(message, withPresetDuration("default", data)),
  {
    success: (message: ReactNode, data?: ExternalToast) =>
      sonnerToast.success(message, withPresetDuration("success", data)),
    error: (message: ReactNode, data?: ExternalToast) =>
      sonnerToast.error(message, withPresetDuration("error", data)),
    warning: (message: ReactNode, data?: ExternalToast) =>
      sonnerToast.warning(message, withPresetDuration("warning", data)),
    info: (message: ReactNode, data?: ExternalToast) =>
      sonnerToast.info(message, withPresetDuration("info", data)),
    message: (message: ReactNode, data?: ExternalToast) =>
      sonnerToast.message(message, withPresetDuration("default", data)),
    /** Mantém duração sob controle da chamada (ex.: loading indefinido). */
    loading: (message: ReactNode, data?: ExternalToast) => sonnerToast.loading(message, data),
    promise: sonnerToast.promise,
    custom: sonnerToast.custom,
    dismiss: sonnerToast.dismiss,
    getHistory: sonnerToast.getHistory,
  }
);

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  return (
    <Sonner
      theme={theme}
      position="top-right"
      offset={TOAST_OFFSET_TOP}
      closeButton
      visibleToasts={3}
      gap={10}
      expand={false}
      /** O contentor do Sonner fica `position:fixed` com z-index muito alto; sem isto pode bloquear cliques no resto da app (Select, Popover, etc.). */
      className="toaster group pointer-events-none [&_[data-sonner-toast]]:pointer-events-auto"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton:
            "group-[.toast]:border-0 group-[.toast]:bg-transparent group-[.toast]:text-muted-foreground hover:group-[.toast]:bg-muted/80 hover:group-[.toast]:text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
