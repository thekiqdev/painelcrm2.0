import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/services/recurringBillingJobService.ts');
let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

function findLine(pred) {
  return lines.findIndex(pred);
}

// Remove calculateNextItemDueDate block (type CustomerItemRecurringInterval through end of function)
const itemStart = findLine((l) => l.startsWith('type CustomerItemRecurringInterval'));
const itemEnd = findLine((l, i) => i > itemStart && l.startsWith('/** Linha mínima'));
if (itemStart >= 0 && itemEnd > itemStart) lines.splice(itemStart, itemEnd - itemStart);

// Remove duplicate normalize functions
const normStart = findLine((l) => l === 'export function normalizeSubscriptionNextBillingYmd(value: unknown): string {');
const normEnd = findLine((l, i) => i > normStart && l.startsWith('/**'));
if (normStart >= 0 && normEnd > normStart) lines.splice(normStart, normEnd - normStart);

// Remove subscriptionSnapshot through advanceSubscription (before processNextBatch comment)
const snapStart = findLine((l) => l.startsWith('function subscriptionSnapshotForTrace'));
const batchStart = findLine((l) => l.includes('Worker: processa um batch'));
if (snapStart >= 0 && batchStart > snapStart) lines.splice(snapStart, batchStart - snapStart);

// Remove processOneRenewalJob and processOneCustomerRenewalJob
const procStart = findLine((l) => l.startsWith('async function processOneRenewalJob'));
const childStart = findLine((l) => l.startsWith('export async function processChildItemDueInvoices'));
if (procStart >= 0 && childStart > procStart) lines.splice(procStart, childStart - procStart);

fs.writeFileSync(file, lines.join('\n'));
console.log('Cleaned recurringBillingJobService.ts', lines.length, 'lines');
