/**
 * Billing Engine V2 — metadata tipada do Billing Plan (JSONB).
 */
import type {
  BillingPlanBillingStrategy,
  BillingPlanCreatedFrom,
  BillingPlanEngineVersion,
} from './types.js';

export type BillingPlanMetadataOrigin = {
  source?: string;
  mapped_from_subscription_id?: string;
  subscription_status?: string;
  subscription_type?: string;
  duplicated_from_plan_id?: string;
  duplicated_from_version?: number;
};

export type BillingPlanMetadataMigration = {
  migrated_at?: string;
  from_engine?: string;
  notes?: string;
};

export type BillingPlanMetadataEngine = {
  engine_version?: BillingPlanEngineVersion;
  billing_strategy?: BillingPlanBillingStrategy;
  shadow_mode?: boolean;
};

export type BillingPlanMetadataFlags = {
  future_items_enabled?: boolean;
  experimental?: boolean;
};

export type BillingPlanMetadataCustom = Record<string, unknown>;

export type BillingPlanMetadataShape = {
  origin?: BillingPlanMetadataOrigin;
  migration?: BillingPlanMetadataMigration;
  engine?: BillingPlanMetadataEngine;
  flags?: BillingPlanMetadataFlags;
  custom?: BillingPlanMetadataCustom;
  created_from?: BillingPlanCreatedFrom;
};

export class BillingPlanMetadata {
  readonly origin: BillingPlanMetadataOrigin;
  readonly migration: BillingPlanMetadataMigration;
  readonly engine: BillingPlanMetadataEngine;
  readonly flags: BillingPlanMetadataFlags;
  readonly custom: BillingPlanMetadataCustom;
  readonly created_from: BillingPlanCreatedFrom | undefined;

  private constructor(shape: BillingPlanMetadataShape) {
    this.origin = shape.origin ?? {};
    this.migration = shape.migration ?? {};
    this.engine = shape.engine ?? {};
    this.flags = shape.flags ?? {};
    this.custom = shape.custom ?? {};
    this.created_from = shape.created_from;
  }

  static fromJson(raw: Record<string, unknown> | null | undefined): BillingPlanMetadata {
    if (!raw || typeof raw !== 'object') {
      return new BillingPlanMetadata({});
    }
    return new BillingPlanMetadata({
      origin: (raw.origin as BillingPlanMetadataOrigin) ?? extractLegacyOrigin(raw),
      migration: (raw.migration as BillingPlanMetadataMigration) ?? {},
      engine: (raw.engine as BillingPlanMetadataEngine) ?? {},
      flags: (raw.flags as BillingPlanMetadataFlags) ?? {},
      custom: (raw.custom as BillingPlanMetadataCustom) ?? {},
      created_from: raw.created_from as BillingPlanCreatedFrom | undefined,
    });
  }

  toJson(): Record<string, unknown> {
    return {
      origin: this.origin,
      migration: this.migration,
      engine: this.engine,
      flags: this.flags,
      custom: this.custom,
      ...(this.created_from ? { created_from: this.created_from } : {}),
    };
  }

  merge(patch: BillingPlanMetadataShape): BillingPlanMetadata {
    return BillingPlanMetadata.fromJson({
      ...this.toJson(),
      ...patch,
      origin: { ...this.origin, ...patch.origin },
      migration: { ...this.migration, ...patch.migration },
      engine: { ...this.engine, ...patch.engine },
      flags: { ...this.flags, ...patch.flags },
      custom: { ...this.custom, ...patch.custom },
    });
  }
}

function extractLegacyOrigin(raw: Record<string, unknown>): BillingPlanMetadataOrigin {
  const origin: BillingPlanMetadataOrigin = {};
  if (typeof raw.source === 'string') origin.source = raw.source;
  if (typeof raw.mapped_from_subscription_id === 'string') {
    origin.mapped_from_subscription_id = raw.mapped_from_subscription_id;
  }
  if (typeof raw.subscription_status === 'string') {
    origin.subscription_status = raw.subscription_status;
  }
  if (typeof raw.subscription_type === 'string') {
    origin.subscription_type = raw.subscription_type;
  }
  if (typeof raw.duplicated_from_plan_id === 'string') {
    origin.duplicated_from_plan_id = raw.duplicated_from_plan_id;
  }
  if (typeof raw.duplicated_from_version === 'number') {
    origin.duplicated_from_version = raw.duplicated_from_version;
  }
  return origin;
}
