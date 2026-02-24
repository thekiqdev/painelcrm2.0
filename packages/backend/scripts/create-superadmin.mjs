/**
 * Script para criar o primeiro usuário Super Admin.
 * Uso: configure .env com SUPERADMIN_EMAIL e SUPERADMIN_PASSWORD, depois:
 *   node packages/backend/scripts/create-superadmin.mjs
 * Ou: node packages/backend/scripts/create-superadmin.mjs <email> <senha>
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const rootEnv = path.resolve(rootDir, '.env');
dotenv.config({ path: rootEnv });
dotenv.config();

const email = process.env.SUPERADMIN_EMAIL || process.argv[2];
const password = process.env.SUPERADMIN_PASSWORD || process.argv[3];

if (!email || !password) {
  console.error('Uso: defina SUPERADMIN_EMAIL e SUPERADMIN_PASSWORD no .env');
  console.error('  ou: node create-superadmin.mjs <email> <senha>');
  process.exit(1);
}

const config = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'painelcrm',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
};

async function main() {
  const pool = new pg.Pool(config);
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const hash = await bcrypt.hash(password, 10);

    await pool.query('BEGIN');

    const colCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_super_admin'
    `);
    if (colCheck.rows.length === 0) {
      await pool.query('ROLLBACK');
      console.error('Execute primeiro a migration 23_add_super_admin.sql (coluna is_super_admin).');
      process.exit(1);
    }

    const existing = await pool.query('SELECT id, is_super_admin FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      await pool.query('UPDATE users SET is_super_admin = true, password_hash = $1, updated_at = now() WHERE id = $2', [hash, existing.rows[0].id]);
      await pool.query('COMMIT');
      console.log('Usuário já existia. is_super_admin definido como true e senha atualizada:', normalizedEmail);
      process.exit(0);
    }

    const insertUser = await pool.query(
      `INSERT INTO users (email, password_hash, email_verified, is_super_admin, created_at, updated_at)
       VALUES ($1, $2, true, true, now(), now())
       RETURNING id`,
      [normalizedEmail, hash]
    );
    const userId = insertUser.rows[0].id;

    await pool.query(
      `INSERT INTO profiles (id, first_name, last_name, company_name, whatsapp_number, registration_complete, created_at, updated_at)
       VALUES ($1, 'Super', 'Admin', 'Painel CRM', '', true, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [userId]
    );

    await pool.query('COMMIT');
    console.log('Super Admin criado com sucesso:', normalizedEmail);
  } catch (e) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('Erro:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
