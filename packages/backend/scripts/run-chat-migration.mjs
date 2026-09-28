import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar variáveis de ambiente
dotenv.config({ path: join(__dirname, '../../.env') });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'painelcrm',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
});

async function runMigration() {
  try {
    console.log('📦 Executando migration de chat...');
    
    // Ler o arquivo SQL
    const sqlFile = join(__dirname, '../../../database/init/15_create_chat_tables.sql');
    const sql = readFileSync(sqlFile, 'utf-8');
    
    console.log(`📄 Arquivo: ${sqlFile}`);
    
    // Executar o SQL
    await pool.query(sql);
    
    console.log('✅ Migration executada com sucesso!');
    console.log('✅ Tabelas criadas:');
    console.log('   - chat_instances');
    console.log('   - chat_conversations');
    console.log('   - chat_messages');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao executar migration:', error.message);
    if (error.code === '42P07') {
      console.log('ℹ️  Tabelas já existem, tudo certo!');
      process.exit(0);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();

