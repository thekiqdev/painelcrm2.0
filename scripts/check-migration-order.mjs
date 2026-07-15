/**
 * MB-033 / Phase 0 — protege migrations novas (>= 291).
 *
 * FAIL quando:
 * - SQL numerado >= 291 em database/init não está em MIGRATION_ORDER
 * - Entrada >= 291 em MIGRATION_ORDER aponta para ficheiro em falta
 *
 * WARN (não falha) para orphans / missing históricos < 291.
 *
 * Uso: node scripts/check-migration-order.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const initDir = path.join(root, 'database', 'init');
const orderFile = path.join(root, 'packages', 'backend', 'src', 'startup', 'migrationOrder.ts');

const ENFORCE_FROM = 291;

function extractOrder(ts) {
  const start = ts.indexOf('export const MIGRATION_ORDER');
  if (start < 0) throw new Error('MIGRATION_ORDER not found');
  const slice = ts.slice(start);
  const matches = [...slice.matchAll(/'([^']+\.sql)'/g)].map((m) => m[1]);
  if (matches.length < 10) throw new Error('MIGRATION_ORDER parse failed (too few entries)');
  return matches;
}

function fileNumber(name) {
  const m = name.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function main() {
  const orderTs = fs.readFileSync(orderFile, 'utf8');
  const orderList = extractOrder(orderTs);
  const ordered = new Set(orderList);
  const files = fs.readdirSync(initDir).filter((f) => f.endsWith('.sql'));

  let failed = false;

  for (const f of orderList) {
    const n = fileNumber(f);
    const exists = fs.existsSync(path.join(initDir, f));
    if (!exists && n !== null && n >= ENFORCE_FROM) {
      console.error(`[check-migration-order] FAIL — missing on disk (enforced): ${f}`);
      failed = true;
    } else if (!exists) {
      console.warn(`[check-migration-order] WARN — order entry missing on disk: ${f}`);
    }
  }

  const newOrphans = files.filter((f) => {
    const n = fileNumber(f);
    if (n === null || n < ENFORCE_FROM) return false;
    return !ordered.has(f);
  });
  if (newOrphans.length > 0) {
    console.error(
      `[check-migration-order] FAIL — SQL >= ${ENFORCE_FROM} in database/init not in MIGRATION_ORDER:`,
    );
    for (const f of newOrphans) console.error('  -', f);
    failed = true;
  }

  if (failed) process.exit(1);

  console.log(
    `[check-migration-order] OK — enforce>=${ENFORCE_FROM}; order=${ordered.size}; initSql=${files.length}`,
  );
}

main();
