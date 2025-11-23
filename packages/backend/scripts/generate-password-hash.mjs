// Script para gerar hash bcrypt de uma senha
import bcrypt from 'bcryptjs';

const password = process.argv[2] || 'admin123';
const rounds = 10;

console.log('Gerando hash bcrypt para senha:', password);
console.log('Rounds:', rounds);
console.log('');

bcrypt.hash(password, rounds)
  .then(hash => {
    console.log('Hash gerado:');
    console.log(hash);
    console.log('');
    console.log('Para usar no SQL:');
    console.log(`UPDATE users SET password_hash = '${hash}' WHERE email = 'admin@painelcrm.com';`);
  })
  .catch(error => {
    console.error('Erro ao gerar hash:', error);
    process.exit(1);
  });

