/**
 * IX1 — namespaces marcados complete no manifesto precisam das mesmas chaves
 * em pt-BR (fonte), en e es.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'src', 'locales', 'manifest.json');

function flatten(value, prefix = '') {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return { [prefix]: true };
  }
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    Object.assign(out, flatten(child, next));
  }
  return out;
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const manifest = loadJson(manifestPath);
const source = manifest.source || 'pt-BR';
const targets = Array.isArray(manifest.targets) ? manifest.targets : ['en', 'es'];
const complete = Array.isArray(manifest.complete) ? manifest.complete : [];
const errors = [];

/** IX10 — superfícies acordadas. `billing` do plano está em `finance` + `checkout`. */
const REQUIRED = [
  'common',
  'landing',
  'auth',
  'checkout',
  'legal',
  'nav',
  'dashboard',
  'crm',
  'chat',
  'agenda',
  'tickets',
  'settings',
  'finance',
  'contracts',
  'proposals',
  'store',
  'automation',
  'superadmin',
  'partner',
];

for (const ns of REQUIRED) {
  if (!complete.includes(ns)) {
    errors.push(`namespace acordado fora de complete: ${ns}`);
  }
}

for (const ns of complete) {
  const sourceFile = path.join(root, 'src', 'locales', source, `${ns}.json`);
  if (!fs.existsSync(sourceFile)) {
    errors.push(`fonte ausente: ${source}/${ns}.json`);
    continue;
  }
  const sourceKeys = Object.keys(flatten(loadJson(sourceFile))).sort();
  for (const target of targets) {
    const targetFile = path.join(root, 'src', 'locales', target, `${ns}.json`);
    if (!fs.existsSync(targetFile)) {
      errors.push(`alvo ausente: ${target}/${ns}.json`);
      continue;
    }
    const targetKeys = new Set(Object.keys(flatten(loadJson(targetFile))));
    for (const key of sourceKeys) {
      if (!targetKeys.has(key)) {
        errors.push(`${target}/${ns}.json sem a chave "${key}"`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error('check:i18n falhou');
  for (const line of errors) console.error(`- ${line}`);
  process.exit(1);
}

console.log(`check:i18n ok (${complete.length} namespace(s) complete)`);
