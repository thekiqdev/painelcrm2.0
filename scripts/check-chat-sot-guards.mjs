/**
 * MB-040 — impede regressões SoT / sockets no Chat FE.
 * Fail se:
 *  - `io(` em arquivos chat sem referência a shouldUseSingleChatSocket / acquireSharedChatSocket
 *  - `latestPage: false` fora da allowlist (dump rollback)
 *  - invalidate root `['floating-chat']` (use helpers cirúrgicos)
 *
 * Allowlist explícita documentada abaixo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SCAN_DIRS = [
  path.join(root, 'src', 'features', 'chat-core'),
  path.join(root, 'src', 'features', 'floating-chat'),
  path.join(root, 'src', 'pages'),
  path.join(root, 'src', 'hooks'),
];

const ALLOW_LATEST_PAGE_FALSE = new Set([
  // testes que exercitam dump legado
  'store.f5.3.floating-messages.test.ts',
  'chat-core.f2.test.ts',
  // comando oficial + política Floating
  'loadMessages.ts',
  'useFloatingConversationMessages.ts',
]);

const ALLOW_IO_WITHOUT_BRIDGE = new Set([
  // bridge defines io()
  'bridge.ts',
  'realtimeClient.ts',
  // notifications non-chat
  'useNotifications.ts',
  'dedicatedSocketTelemetry.ts',
]);

const ALLOW_FLOATING_ROOT_INVALIDATE = new Set([
  // reset total de instância WhatsApp — wipe intencional
  'whatsappInstanceCacheReset.ts',
]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

const errors = [];
const files = SCAN_DIRS.flatMap((d) => walk(d));

for (const file of files) {
  const base = path.basename(file);
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const text = fs.readFileSync(file, 'utf8');

  if (/\bio\s*\(/.test(text) && !ALLOW_IO_WITHOUT_BRIDGE.has(base)) {
    const hasBridgeGate =
      text.includes('shouldUseSingleChatSocket') || text.includes('acquireSharedChatSocket');
    if (!hasBridgeGate) {
      errors.push(`${rel}: io() without F1 bridge gate`);
    }
  }

  if (/latestPage\s*:\s*false/.test(text) && !ALLOW_LATEST_PAGE_FALSE.has(base)) {
    // policy file / dump rollback call sites ok if they check shouldFloatDumpAllMessages
    if (
      !text.includes('shouldFloatDumpAllMessages') &&
      !rel.includes('floatingMessageLoadPolicy')
    ) {
      errors.push(`${rel}: latestPage: false outside allowlist (use VITE_FLOAT_MESSAGES_DUMP)`);
    }
  }

  if (
    /invalidateQueries\(\s*\{\s*queryKey:\s*\[\s*['"]floating-chat['"]\s*\]/.test(text) &&
    !ALLOW_FLOATING_ROOT_INVALIDATE.has(base)
  ) {
    errors.push(`${rel}: root invalidate ['floating-chat'] — use floatingChatQueries helpers`);
  }
}

if (errors.length) {
  console.error('[check-chat-sot-guards] FAILED');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log(`[check-chat-sot-guards] OK — scanned=${files.length}`);
