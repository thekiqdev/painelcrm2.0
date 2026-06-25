import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';

/** Subscreve eventos realtime do header sem forçar re-render do chrome inteiro. */
export function HeaderRealtimeBridge() {
  useRealtimeEvents();
  return null;
}
