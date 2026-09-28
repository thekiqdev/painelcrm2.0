import { useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChatShell, ChatComposerPlaceholder } from '@/components/chat/ChatShell';
import { ConversationListSkeleton } from '@/components/chat/skeletons/ConversationListSkeleton';
import { MessageListSkeleton } from '@/components/chat/skeletons/MessageListSkeleton';
import { chatRouteMarkSuspenseFallback } from '@/lib/chatRouteTiming';
import { cn } from '@/lib/utils';

/**
 * Fallback leve do Suspense da rota /chat — shell + skeletons no bundle principal,
 * sem esperar o chunk pesado de pages/Chat.tsx (~2s de tela branca).
 */
export function ChatRouteFallback() {
  useEffect(() => {
    chatRouteMarkSuspenseFallback();
  }, []);

  return (
    <ChatShell>
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden md:h-full">
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pt-2 pb-2 md:flex-row md:items-stretch md:gap-3 md:px-3 md:pt-3 md:pb-0">
          <Card
            className={cn(
              'flex min-h-0 flex-col border-border/80 shadow-sm md:h-full md:w-[400px] md:min-w-[400px] md:max-w-[400px] md:shrink-0',
            )}
          >
            <CardHeader className="flex-shrink-0 space-y-2 border-b border-border bg-muted/20 px-2 py-2">
              <Skeleton className="h-9 w-full rounded-md" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-24 rounded-md" />
                <Skeleton className="h-8 w-20 rounded-md" />
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
              <ConversationListSkeleton />
            </CardContent>
          </Card>
          <Card className="hidden min-h-0 flex-1 flex-col border-border/80 shadow-sm md:flex md:min-h-0">
            <CardHeader className="flex-shrink-0 border-b border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
              <MessageListSkeleton className="min-h-0 flex-1" />
              <ChatComposerPlaceholder />
            </CardContent>
          </Card>
        </div>
      </div>
    </ChatShell>
  );
}
