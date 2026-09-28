import type { DomainEventKey } from './domainEventKeys.js';

export type OutboxEventStatus =
  | 'pending'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'dead_letter';

export type OutboxEventRow = {
  id: string;
  event_key: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  tenant_id: string | null;
  correlation_id: string;
  payload_json: Record<string, unknown>;
  metadata_json: Record<string, unknown>;
  idempotency_key: string;
  status: OutboxEventStatus;
  attempts: number;
  max_attempts: number;
  next_retry_at: string;
  priority: number;
  last_error: string | null;
  locked_by: string | null;
  locked_at: string | null;
  published_at: string | null;
  failed_at: string | null;
  dead_letter_at: string | null;
  causation_id: string | null;
  replay_of_event_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PublishDomainEventInput = {
  eventKey: DomainEventKey | string;
  aggregateType: string;
  aggregateId: string;
  tenantId?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  idempotencyKey: string;
  eventVersion?: number;
  priority?: number;
  maxAttempts?: number;
  replayOfEventId?: string | null;
};

export type PublishDomainEventResult =
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'inserted'; eventId: string; shadow: boolean }
  | { outcome: 'duplicate'; eventId: string; shadow: boolean };

export type OutboxPublisherBatchResult = {
  reclaimed: number;
  claimed: number;
  published: number;
  retried: number;
  deadLettered: number;
  errors: number;
  skipped_flag_off: boolean;
};
