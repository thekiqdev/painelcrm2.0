/** Motivos permitidos para reconcile HTTP (F3). Nunca `message_received`. */
export type ChatReconcileReason =
  | 'bootstrap'
  | 'login'
  | 'logout'
  | 'session_change'
  | 'tenant_change'
  | 'user_change'
  | 'cache_expired'
  | 'reconnect'
  | 'network_online'
  | 'tab_visible'
  | 'attendance_ws_dirty'
  | 'inconsistency'
  | 'manual'
  | 'prefetch';

export type ChatReconcileScope = 'instances' | 'attendance' | 'all';
