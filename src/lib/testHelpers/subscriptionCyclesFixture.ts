import type { CrmSubscriptionDetailPayload, CrmSubscriptionTimelineRow } from '@/services/crmSubscriptions';

function cycleStatusFromRow(row: CrmSubscriptionTimelineRow): string {
  if (row.cycle_status) return row.cycle_status;
  if (row.invoice_id) return 'generated';
  if (row.operational_state === 'failed') return 'failed';
  if (row.operational_state === 'skipped') return 'skipped';
  return 'pending';
}

/** Deriva cycles_raw a partir da timeline (fixtures de teste). */
export function cyclesRawFromTimeline(
  timeline: CrmSubscriptionTimelineRow[]
): CrmSubscriptionDetailPayload['cycles_raw'] {
  const seen = new Set<string>();
  const out: CrmSubscriptionDetailPayload['cycles_raw'] = [];
  for (const row of timeline) {
    if (!row.cycle_id || row.merge_source === 'lifecycle' || seen.has(row.cycle_id)) continue;
    seen.add(row.cycle_id);
    const due = row.due_date ?? row.cycle_date ?? '';
    out.push({
      id: row.cycle_id,
      cycle_date: due,
      period_start: row.period_start,
      period_end: row.period_end,
      status: cycleStatusFromRow(row),
      invoice_id: row.invoice_id,
      job_id: row.job_id ?? null,
      processed_at: row.processed_at ?? null,
      skipped_reason: row.cycle_skipped_reason ?? null,
      error_message: row.job_error_snippet ?? null,
    });
  }
  return out;
}

export function withCyclesFromTimeline(
  detail: CrmSubscriptionDetailPayload,
  timeline?: CrmSubscriptionTimelineRow[]
): CrmSubscriptionDetailPayload {
  const tl = timeline ?? detail.timeline;
  const cycles_raw = cyclesRawFromTimeline(tl);
  return {
    ...detail,
    timeline: tl,
    cycles_raw,
    cycles_read_enabled: cycles_raw.length > 0,
  };
}
