import jwt from 'jsonwebtoken';

const JWT_SECRET: string = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

export interface JWTPayload {
  userId: string;
  email: string;
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/** Token de curta duração para impersonation (1h). */
export function generateImpersonationToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '1h',
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

const PASSWORD_RESET_PURPOSE = 'password_reset_complete' as const;

export type PasswordResetCompletionPayload = JWTPayload & { purpose: typeof PASSWORD_RESET_PURPOSE };

/** Token curto (15 min) emitido após validar o código WhatsApp; permite apenas POST /password-reset/complete. */
export function generatePasswordResetCompletionToken(userId: string, email: string): string {
  return jwt.sign(
    { userId, email, purpose: PASSWORD_RESET_PURPOSE },
    JWT_SECRET,
    { expiresIn: '15m' } as jwt.SignOptions,
  );
}

export function verifyPasswordResetCompletionToken(token: string): PasswordResetCompletionPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & {
    userId?: string;
    email?: string;
    purpose?: string;
  };
  if (
    decoded.purpose !== PASSWORD_RESET_PURPOSE ||
    typeof decoded.userId !== 'string' ||
    typeof decoded.email !== 'string'
  ) {
    throw new Error('Invalid or expired token');
  }
  return {
    userId: decoded.userId,
    email: decoded.email,
    purpose: PASSWORD_RESET_PURPOSE,
  };
}

