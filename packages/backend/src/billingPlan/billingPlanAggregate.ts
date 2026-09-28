/**

 * Billing Engine V2 — Aggregate Root (representação; sem regras de negócio).

 */

import type { BillingCycle, BillingPlanRow, BillingRule } from './types.js';

import type { BillingPlanItemRow } from '../billingPlanItems/types.js';
import type { BillingItemSnapshot } from '../billingPlanItemSnapshot/types.js';

import { BillingPlanIdentity } from './billingPlanIdentity.js';

import { BillingPlanMetadata } from './billingPlanMetadata.js';



export type BillingPlanRulesPlaceholder = {

  rules: BillingRule[];

  note: 'placeholder_sprint_2_2';

};



export class BillingPlanAggregate {

  readonly plan: BillingPlanRow;

  readonly identity: BillingPlanIdentity;

  readonly metadata: BillingPlanMetadata;

  readonly cycles: BillingCycle[];

  readonly items: BillingPlanItemRow[];

  readonly currentRevision: number | null;

  readonly revisionHistory: BillingPlanItemRow[];

  readonly snapshots: BillingItemSnapshot[];

  readonly rules: BillingPlanRulesPlaceholder;



  private constructor(params: {

    plan: BillingPlanRow;

    identity: BillingPlanIdentity;

    metadata: BillingPlanMetadata;

    cycles?: BillingCycle[];

    items?: BillingPlanItemRow[];

    currentRevision?: number | null;

    revisionHistory?: BillingPlanItemRow[];

    snapshots?: BillingItemSnapshot[];

    rules?: BillingPlanRulesPlaceholder;

  }) {

    this.plan = params.plan;

    this.identity = params.identity;

    this.metadata = params.metadata;

    this.cycles = params.cycles ?? [];

    this.items = params.items ?? [];

    this.currentRevision = params.currentRevision ?? null;

    this.revisionHistory = params.revisionHistory ?? [];

    this.snapshots = params.snapshots ?? [];

    this.rules = params.rules ?? { rules: [], note: 'placeholder_sprint_2_2' };

  }



  static fromPlanRow(

    plan: BillingPlanRow,

    items: BillingPlanItemRow[] = [],

    extras?: {

      currentRevision?: number | null;

      revisionHistory?: BillingPlanItemRow[];

      snapshots?: BillingItemSnapshot[];

    }

  ): BillingPlanAggregate {

    return new BillingPlanAggregate({

      plan,

      identity: BillingPlanIdentity.fromRow(plan),

      metadata: BillingPlanMetadata.fromJson(plan.metadata),

      items,

      currentRevision: extras?.currentRevision ?? null,

      revisionHistory: extras?.revisionHistory ?? [],

      snapshots: extras?.snapshots ?? [],

    });

  }



  static create(params: {

    plan: BillingPlanRow;

    cycles?: BillingCycle[];

    items?: BillingPlanItemRow[];

    currentRevision?: number | null;

    revisionHistory?: BillingPlanItemRow[];

    snapshots?: BillingItemSnapshot[];

    rules?: BillingPlanRulesPlaceholder;

  }): BillingPlanAggregate {

    return new BillingPlanAggregate({

      plan: params.plan,

      identity: BillingPlanIdentity.fromRow(params.plan),

      metadata: BillingPlanMetadata.fromJson(params.plan.metadata),

      cycles: params.cycles,

      items: params.items,

      currentRevision: params.currentRevision,

      revisionHistory: params.revisionHistory,

      snapshots: params.snapshots,

      rules: params.rules,

    });

  }

}



export function buildBillingPlanAggregate(

  plan: BillingPlanRow,

  items: BillingPlanItemRow[] = [],

  extras?: {

    currentRevision?: number | null;

    revisionHistory?: BillingPlanItemRow[];

    snapshots?: BillingItemSnapshot[];

  }

): BillingPlanAggregate {

  return BillingPlanAggregate.fromPlanRow(plan, items, extras);

}

