import { FloatingChatProvider } from './FloatingChatProvider';
import { FloatingChatWidget } from './FloatingChatWidget';

/** Provider + widget num único chunk lazy (FloatingChatDeferred). */
export default function FloatingChatBundle({ children }: { children: React.ReactNode }) {
  return (
    <FloatingChatProvider>
      {children}
      <FloatingChatWidget />
    </FloatingChatProvider>
  );
}
