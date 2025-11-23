import jwt from 'jsonwebtoken';

const JWT_SECRET: string = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

export interface JWTPayload {
  userId: string;
  email: string;
}

// Função para obter e validar expiresIn
function getExpiresIn(): string {
  const envValue = process.env.JWT_EXPIRES_IN;
  
  // Log para debug
  console.log(`[JWT] JWT_EXPIRES_IN raw value: "${envValue}"`);
  
  // Se não estiver definido ou estiver vazio, usar padrão
  if (!envValue || envValue.trim() === '') {
    console.log(`[JWT] JWT_EXPIRES_IN está vazio, usando padrão "7d"`);
    return '7d';
  }
  
  // Remover espaços e caracteres extras
  const cleaned = envValue.trim();
  console.log(`[JWT] JWT_EXPIRES_IN cleaned: "${cleaned}"`);
  
  // Validar formato: deve ser número ou string como "1d", "20h", "7d", etc.
  // Aceita: números, ou strings que começam com número seguido de letra (s, m, h, d)
  // Exemplos válidos: "7d", "24h", "60m", "3600", "1d", "20h"
  const isValidFormat = /^(\d+[smhd]?|\d+)$/i.test(cleaned);
  
  if (!isValidFormat) {
    console.warn(`[JWT] JWT_EXPIRES_IN com formato inválido: "${cleaned}". Usando padrão "7d"`);
    return '7d';
  }
  
  console.log(`[JWT] Usando expiresIn: "${cleaned}"`);
  return cleaned;
}

export function generateToken(payload: JWTPayload): string {
  // Garantir que JWT_SECRET está configurado
  if (!JWT_SECRET || JWT_SECRET === 'your-super-secret-jwt-key-change-this-in-production') {
    throw new Error('JWT_SECRET não está configurado corretamente');
  }
  
  const expiresIn = getExpiresIn();
  
  // Log para debug
  console.log(`[JWT] Gerando token com expiresIn: "${expiresIn}" (tipo: ${typeof expiresIn})`);
  
  try {
    // Passar o objeto diretamente sem tipagem explícita
    // jwt.sign aceita string ou number para expiresIn em runtime
    // @ts-expect-error - TypeScript é muito estrito com StringValue, mas jwt.sign aceita string em runtime
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: expiresIn,
    });
    console.log(`[JWT] Token gerado com sucesso`);
    return token;
  } catch (error) {
    console.error(`[JWT] Erro ao gerar token:`, error);
    console.error(`[JWT] expiresIn usado: "${expiresIn}"`);
    throw error;
  }
}

export function verifyToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch {
    return null;
  }
}


