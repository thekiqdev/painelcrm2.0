// Script para atualizar senha do admin via API
// Usa fetch nativo do Node.js 20+

const email = process.argv[2] || 'admin@painelcrm.com';
const password = process.argv[3] || 'admin123';
const apiUrl = process.env.API_URL || 'http://localhost:3001';

console.log('Atualizando senha do admin...');
console.log('Email:', email);
console.log('API URL:', apiUrl);
console.log('');

try {
  const response = await fetch(`${apiUrl}/api/auth/update-admin-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('❌ Erro:', data.error || 'Unknown error');
    process.exit(1);
  }

  console.log('✅ Senha atualizada com sucesso!');
  console.log('Resposta:', JSON.stringify(data, null, 2));
} catch (error) {
  console.error('❌ Erro ao fazer requisição:', error.message);
  process.exit(1);
}

