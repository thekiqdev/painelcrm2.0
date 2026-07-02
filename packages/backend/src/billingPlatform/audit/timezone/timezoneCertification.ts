/**
 * Sprint 4.2 — Timezone certification (backend civil dates).
 */
import { DateTime } from 'luxon';
import { isValidYmd, normalizeBillingDate, safeTodayYmd } from '../../../utils/billingSafeDate.js';
import type { AuditIssue, AuditModuleResult } from '../types.js';

const TIMEZONES = [
  'America/Sao_Paulo',
  'UTC',
  'America/New_York',
  'Europe/Berlin',
] as const;

const CIVIL_DATES = ['2026-06-30', '2026-12-31', '2026-03-01', '2024-02-29'] as const;

function todayInZone(timeZone: string, utcIso: string): string {
  return DateTime.fromISO(utcIso, { zone: 'utc' }).setZone(timeZone).toFormat('yyyy-MM-dd');
}

export async function certifyBillingTimezone(): Promise<AuditModuleResult> {
  const started = Date.now();
  const issues: AuditIssue[] = [];
  const repairs: string[] = [];
  const metrics: Record<string, number | string | boolean | null> = {};

  for (const ymd of CIVIL_DATES) {
    const normalized = normalizeBillingDate(ymd);
    if (normalized !== ymd) {
      issues.push({
        code: 'ymd_normalize_mismatch',
        severity: 'error',
        message: `normalizeBillingDate(${ymd}) => ${normalized}`,
      });
    }
    if (!isValidYmd(ymd)) {
      issues.push({ code: 'invalid_ymd', severity: 'error', message: `YMD inválido: ${ymd}` });
    }
  }

  const boundaryUtc = '2026-07-01T02:30:00.000Z';
  const spToday = todayInZone('America/Sao_Paulo', boundaryUtc);
  const utcToday = todayInZone('UTC', boundaryUtc);
  metrics.boundary_sp_today = spToday;
  metrics.boundary_utc_today = utcToday;

  if (spToday !== '2026-06-30') {
    issues.push({
      code: 'sp_boundary_failed',
      severity: 'error',
      message: `Esperado 2026-06-30 em SP, recebido ${spToday}`,
    });
  }
  if (utcToday !== '2026-07-01') {
    issues.push({
      code: 'utc_boundary_failed',
      severity: 'error',
      message: `Esperado 2026-07-01 em UTC, recebido ${utcToday}`,
    });
  }

  for (const tz of TIMEZONES) {
    try {
      const dt = DateTime.now().setZone(tz);
      metrics[`tz_${tz.replace(/\//g, '_')}_valid`] = dt.isValid;
      if (!dt.isValid) {
        issues.push({ code: 'invalid_timezone', severity: 'error', message: `Fuso inválido: ${tz}` });
      }
    } catch {
      issues.push({ code: 'invalid_timezone', severity: 'error', message: `Fuso inválido: ${tz}` });
    }
  }

  metrics.safe_today_ymd = safeTodayYmd();

  const certified = !issues.some((i) => i.severity === 'error');

  return {
    module: 'timezone',
    certified,
    generated_at_iso: new Date().toISOString(),
    duration_ms: Date.now() - started,
    issues,
    repairs,
    metrics,
  };
}
