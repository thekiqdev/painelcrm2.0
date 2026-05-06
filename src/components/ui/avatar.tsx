import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"
import { chatAvatarDebugLogImageError, isChatAvatarDebugEnabled } from "@/lib/chatAvatarDebug"
import { useChatAvatarProxySrc } from "@/hooks/useChatAvatarProxySrc"

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
>(({ className, onError, src, ...props }, ref) => {
  const proxyResolved = useChatAvatarProxySrc(typeof src === 'string' ? src : undefined);
  const isProxyAvatar =
    typeof src === 'string' && src.includes('/api/chat/avatar-proxy');
  const displaySrc = isProxyAvatar ? proxyResolved : src;
  /**
   * Proxy exige fetch+blob: sem `displaySrc`, não montar `<Image>` com src indefinido —
   * o Radix deixava só o “buraco” sem disparar Fallback (lista do chat parecia sem foto).
   * Sem proxy, `displaySrc` existe desde já (URLs assinadas / diretas).
   */
  const renderImage = typeof displaySrc === 'string' && displaySrc.trim().length > 0;

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.target as HTMLImageElement;
    const srcStr = target.src || '';
    if (isChatAvatarDebugEnabled()) {
      chatAvatarDebugLogImageError({
        srcPrefix: srcStr.length > 200 ? `${srcStr.slice(0, 200)}…` : srcStr,
        isWhatsappUrl: srcStr.includes('whatsapp.net') || srcStr.includes('whatsapp.com'),
      });
    }
    if (onError) {
      onError(e);
    }
  };

  if (!renderImage) {
    return null;
  }

  return (
    <AvatarPrimitive.Image
      ref={ref}
      className={cn("aspect-square h-full w-full", className)}
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
      onError={handleError}
      {...props}
      src={displaySrc}
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
