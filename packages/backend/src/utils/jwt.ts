import jwt from 'jsonwebtoken';

const JWT_SECRET: string = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

export interface JWTPayload {
  userId: string;
  email: string;
}

export function generateToken(payload: JWTPayload): string {
  // Garantir que JWT_SECRET e JWT_EXPIRES_IN estão definidos
  if (!JWT_SECRET || JWT_SECRET === 'your-super-secret-jwt-key-change-this-in-production') {
    throw new Error('JWT_SECRET não está configurado corretamente');
  }
  
  const expiresIn = JWT_EXPIRES_IN || '7d';
  
  // Usar type assertion para evitar problemas de tipo com StringValue
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: expiresIn as string,
  } as jwt.SignOptions);
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


