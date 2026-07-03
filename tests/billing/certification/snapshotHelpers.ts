import fs from 'node:fs';
import path from 'node:path';
import type { BillingVisualFixture } from './captureVisualFixture';

const SNAPSHOT_DIR = path.resolve(__dirname, '../snapshots');

export function snapshotPath(scenarioId: string): string {
  return path.join(SNAPSHOT_DIR, `${scenarioId}.json`);
}

export function loadSnapshot(scenarioId: string): BillingVisualFixture | null {
  const file = snapshotPath(scenarioId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as BillingVisualFixture;
}

export function saveSnapshot(scenarioId: string, fixture: BillingVisualFixture): void {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  fs.writeFileSync(snapshotPath(scenarioId), `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
}

export const UPDATE_BILLING_SNAPSHOTS = process.env.UPDATE_BILLING_SNAPSHOTS === '1';
