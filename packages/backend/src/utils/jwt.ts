import jwt from 'jsonwebtoken';

const JWT_SECRET: string = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

export interface JWTPayload {
  userId: string;
  email: string;
}

// Função para obter e validar expiresIn
function getExpiresIn(): string | number {
  const envValue = process.env.JWT_EXPIRES_IN;
  
  // Log para debug
  console.log(`[JWT] JWT_EXPIRES_IN raw value:`, JSON.stringify(envValue));
  console.log(`[JWT] JWT_EXPIRES_IN type:`, typeof envValue);
  
  // Se não estiver definido ou estiver vazio, usar padrão
  if (!envValue || (typeof envValue === 'string' && envValue.trim() === '')) {
    console.log(`[JWT] JWT_EXPIRES_IN está vazio ou undefined, usando padrão "7d"`);
    return '7d';
  }
  
  // Remover espaços e caracteres extras se for string
  const cleaned = typeof envValue === 'string' ? envValue.trim() : String(envValue).trim();
  console.log(`[JWT] JWT_EXPIRES_IN cleaned:`, JSON.stringify(cleaned));
  
  // Se for um número puro, retornar como número (em segundos)
  const numValue = Number(cleaned);
  if (!isNaN(numValue) && isFinite(numValue) && /^\d+$/.test(cleaned)) {
    console.log(`[JWT] JWT_EXPIRES_IN é número, usando:`, numValue);
    return numValue;
  }
  
  // Validar formato de string: deve ser como "1d", "20h", "7d", etc.
  // Aceita: strings que começam com número seguido de letra (s, m, h, d)
  // Exemplos válidos: "7d", "24h", "60m", "1d", "20h"
  const isValidFormat = /^\d+[smhd]$/i.test(cleaned);
  
  if (!isValidFormat) {
    console.warn(`[JWT] JWT_EXPIRES_IN com formato inválido: "${cleaned}". Usando padrão "7d"`);
    return '7d';
  }
  
  console.log(`[JWT] Usando expiresIn:`, JSON.stringify(cleaned));
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


