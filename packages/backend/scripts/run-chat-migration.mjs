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
    
    // 1) Criar tabelas base (se ainda não existirem)
    const baseSqlFile = join(__dirname, '../../../database/init/15_create_chat_tables.sql');
    const baseSql = readFileSync(baseSqlFile, 'utf-8');
    console.log(`📄 Arquivo base: ${baseSqlFile}`);
    await pool.query(baseSql);

    // 2) Aplicar alterações incrementais (atribuição/fila/eventos)
    const alterSqlFile = join(__dirname, '../../../database/init/16_alter_chat_conversations_add_assignment.sql');
    const alterSql = readFileSync(alterSqlFile, 'utf-8');
    console.log(`📄 Arquivo incremental: ${alterSqlFile}`);
    await pool.query(alterSql);
    
    console.log('✅ Migration executada com sucesso!');
    console.log('✅ Tabelas criadas/atualizadas:');
    console.log('   - chat_instances');
    console.log('   - chat_conversations (+ campos de atribuição/fila)');
    console.log('   - chat_messages');
    console.log('   - chat_conversation_events');
    
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

