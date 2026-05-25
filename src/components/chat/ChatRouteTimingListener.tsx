import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { chatRouteMarkRouteEnter } from '@/lib/chatRouteTiming';

/** Marca `route_enter` ao navegar para /chat (antes do Suspense/chunk). */
export function ChatRouteTimingListener() {
  const { pathname } = useLocation();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    const isChat =
      pathname === '/chat' || pathname.startsWith('/chat/');
    const wasChat =
      prevPathRef.current === '/chat' ||
      (prevPathRef.current?.startsWith('/chat/') ?? false);
    prevPathRef.current = pathname;
    if (isChat && !wasChat) {
      chatRouteMarkRouteEnter('pathname');
    }
  }, [pathname]);

  return null;
}
