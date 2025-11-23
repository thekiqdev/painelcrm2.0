import jwt from 'jsonwebtoken';

const JWT_SECRET: string = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

export interface JWTPayload {
  userId: string;
  email: string;
}

// Função para obter e validar expiresIn
function getExpiresIn(): string {
  const envValue = process.env.JWT_EXPIRES_IN;
  
  // Se não estiver definido ou estiver vazio, usar padrão
  if (!envValue || envValue.trim() === '') {
    return '7d';
  }
  
  // Remover espaços e caracteres extras
  const cleaned = envValue.trim();
  
  // Validar formato: deve ser número ou string como "1d", "20h", "7d", etc.
  // Aceita: números, ou strings que começam com número seguido de letra
  const isValidFormat = /^(\d+[smhd]?|\d+)$/i.test(cleaned);
  
  if (!isValidFormat) {
    console.warn(`JWT_EXPIRES_IN com formato inválido: "${cleaned}". Usando padrão "7d"`);
    return '7d';
  }
  
  return cleaned;
}

export function generateToken(payload: JWTPayload): string {
  // Garantir que JWT_SECRET está configurado
  if (!JWT_SECRET || JWT_SECRET === 'your-super-secret-jwt-key-change-this-in-production') {
    throw new Error('JWT_SECRET não está configurado corretamente');
  }
  
  const expiresIn = getExpiresIn();
  
  // Passar expiresIn diretamente - jwt.sign aceita string ou number
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: expiresIn,
  });
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


