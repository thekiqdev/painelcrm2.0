import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, onError, ...props }, ref) => {
  // Tratar erros de imagem silenciosamente (especialmente para imagens do WhatsApp que podem dar 403)
  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // Silenciar erros de imagens do WhatsApp (403 é esperado devido a CORS)
    const target = e.target as HTMLImageElement;
    if (target.src && (target.src.includes('whatsapp.net') || target.src.includes('whatsapp.com'))) {
      // Erro esperado, não logar
      return;
    }
    // Para outras imagens, chamar handler original se fornecido
    if (onError) {
      onError(e);
    }
  };

  return (
    <AvatarPrimitive.Image
      ref={ref}
      className={cn("aspect-square h-full w-full", className)}
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
      onError={handleError}
      {...props}
    />
  );
})
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarImage, AvatarFallback }
