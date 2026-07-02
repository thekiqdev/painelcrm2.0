import {
  recordProvisionRuntimeError,
  recordProvisionSqlError,
  recordTenantResolutionError,
} from './billingPlanProvisionMetrics.js';

export function isPgError(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    String((err as { code: unknown }).code) === code
  );
}

export function observeProvisionFailure(err: unknown): void {
  recordProvisionRuntimeError();
  if (isPgError(err, '42703')) {
    recordTenantResolutionError();
    recordProvisionSqlError();
    return;
  }
  if (typeof err === 'object' && err !== null && 'code' in err) {
    recordProvisionSqlError();
  }
}

export function pgErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
