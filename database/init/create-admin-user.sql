-- Script para criar usuário admin de teste
-- Email: admin@painelcrm.com
-- WhatsApp: 11981199950
-- Senha: admin123

-- Hash bcrypt da senha "admin123" (10 rounds)
-- Gerado com: bcrypt.hash('admin123', 10)

-- Inserir usuário
INSERT INTO users (id, email, password_hash, whatsapp_number, email_verified, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'admin@painelcrm.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', -- hash de "admin123"
  '11981199950',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE
SET 
  password_hash = EXCLUDED.password_hash,
  whatsapp_number = EXCLUDED.whatsapp_number,
  updated_at = NOW();

-- Criar perfil associado
INSERT INTO profiles (id, first_name, last_name, company_name, whatsapp_number, whatsapp_connected, registration_complete, created_at, updated_at)
SELECT 
  u.id,
  'Admin',
  'PainelCRM',
  'PainelCRM',
  '11981199950',
  false,
  true,
  NOW(),
  NOW()
FROM users u
WHERE u.email = 'admin@painelcrm.com'
ON CONFLICT (id) DO UPDATE
SET 
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  company_name = EXCLUDED.company_name,
  whatsapp_number = EXCLUDED.whatsapp_number,
  updated_at = NOW();

-- Verificar se foi criado
SELECT 
  u.id,
  u.email,
  u.whatsapp_number,
  u.email_verified,
  p.first_name,
  p.last_name,
  p.registration_complete
FROM users u
LEFT JOIN profiles p ON u.id = p.id
WHERE u.email = 'admin@painelcrm.com';

