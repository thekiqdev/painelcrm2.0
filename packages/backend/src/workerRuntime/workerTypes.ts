export type PlatformWorkerStatus =
  | 'starting'
  | 'healthy'
  | 'degraded'
  | 'shutting_down'
  | 'stopped'
  | 'failed';

export type PlatformWorkerHeartbeatRow = {
  worker_id: string;
  worker_type: string;
  status: PlatformWorkerStatus;
  started_at: string;
  last_heartbeat_at: string;
  last_success_at: string | null;
  last_error_at: string | null;
  correlation_id: string | null;
  lock_token: string | null;
  locked_at: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WorkerBatchContext = {
  workerId: string;
  workerType: string;
  correlationId: string;
  batchNumber: number;
  isShutdownRequested: () => boolean;
  /** Touch heartbeat mid-batch (when heartbeat flag ON). */
  pulse: (metadata?: Record<string, unknown>) => Promise<void>;
  /** Acquire ephemeral lock token in heartbeat row (foundation). */
  acquireLock: (token: string) => Promise<void>;
  releaseLock: () => Promise<void>;
};

export type RunWorkerOptions<T> = {
  workerType: string;
  workerId?: string;
  correlationId?: string;
  loop?: boolean;
  pollIntervalMs?: number;
  /** Called on SIGINT/SIGTERM after current batch (e.g. outbox loop stop). */
  onSignalShutdown?: () => void;
  /** Optional finalizer (e.g. flush side-effects). */
  onFinalFlush?: () => Promise<void>;
  runBatch: (ctx: WorkerBatchContext) => Promise<T>;
};

export type WorkerReclaimResult = {
  degraded: number;
  failed: number;
  locks_cleared: number;
};

export type WorkerHealthSnapshot = {
  enabled: boolean;
  workers: Array<
    PlatformWorkerHeartbeatRow & {
      age_seconds: number;
      stale: boolean;
      uptime_seconds: number;
    }
  >;
  stale_count: number;
  degraded_count: number;
};
