/**
 * IX10 — trava pt-BR / BRL fixo na UI.
 * Arquivo novo com toLocaleString('pt-BR') ou currency: 'BRL', ou contagem
 * maior que a lista, faz este script falhar. A lista é a justificativa do que resta.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowPath = path.join(root, 'scripts', 'i18n-hardcode-allowlist.json');
const re = /toLocaleString\(\s*['"]pt-BR['"]|currency:\s*['"]BRL['"]/g;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(full);
  }
  return out;
}

function why(rel) {
  const f = rel.replace(/\\/g, '/');
  if (/\.test\.tsx?$/.test(f)) return 'fixture de teste';
  if (f.endsWith('src/lib/brlCurrencyInput.ts')) return 'máscara de digitação em real';
  if (/import.*Csv/.test(f)) return 'importação: moeda default do dado legado é BRL';
  if (f.includes('/partner/') || f.includes('partnerTypes')) return 'D16: licença de parceiro permanece em BRL';
  if (f.includes('/superadmin/') || f.includes('superadmin')) {
    return 'interior operacional do Super Admin, fora do chrome de planos e notificações';
  }
  if (f.includes('/finance/') || f.includes('financial') || f.includes('Financial') || f.includes('/projects/')) {
    return 'livro sem coluna de moeda; o valor gravado é BRL';
  }
  if (f.includes('subscription') || f.includes('billing') || f.includes('Billing')) {
    return 'tela de assinatura ainda formata BRL; o centavo gravado não muda com USD/EUR';
  }
  return 'registro sem moeda própria; o default do Brasil continua BRL e pt-BR';
}

function scan() {
  const files = walk(path.join(root, 'src'));
  const found = {};
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const n = (text.match(re) || []).length;
    if (!n) continue;
    const rel = path.relative(root, file).replace(/\\/g, '/');
    found[rel] = n;
  }
  return found;
}

const found = scan();

if (process.argv.includes('--write')) {
  const files = {};
  for (const [rel, count] of Object.entries(found).sort(([a], [b]) => a.localeCompare(b))) {
    files[rel] = { count, why: why(rel) };
  }
  const body = {
    note: 'IX10. Aumentar count ou acrescentar arquivo sem atualizar esta lista quebra npm run check:i18n-hardcode.',
    files,
  };
  fs.writeFileSync(allowPath, `${JSON.stringify(body, null, 2)}\n`);
  console.log(`allowlist escrita (${Object.keys(files).length} arquivos)`);
  process.exit(0);
}

if (!fs.existsSync(allowPath)) {
  console.error('allowlist ausente. Rode: node scripts/check-i18n-hardcode.mjs --write');
  process.exit(1);
}

const allow = JSON.parse(fs.readFileSync(allowPath, 'utf8'));
const listed = allow.files || {};
const errors = [];

for (const [rel, count] of Object.entries(found)) {
  const row = listed[rel];
  if (!row) {
    errors.push(`novo hardcoded pt-BR/BRL: ${rel} (${count})`);
    continue;
  }
  if (count > row.count) {
    errors.push(`${rel}: ${count} ocorrências, lista permite ${row.count}`);
  }
}

for (const rel of Object.keys(listed)) {
  if (!(rel in found)) {
    errors.push(`lista desatualizada, arquivo limpo: ${rel}`);
  }
}

if (errors.length) {
  console.error('check:i18n-hardcode falhou');
  for (const line of errors) console.error(`- ${line}`);
  process.exit(1);
}

console.log(`check:i18n-hardcode ok (${Object.keys(found).length} arquivos na lista)`);
