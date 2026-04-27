import jwt from 'jsonwebtoken';

const PURPOSE = 'google_calendar_oauth' as const;

const JWT_SECRET: string = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

export type GoogleCalendarOAuthStatePayload = {
  purpose: typeof PURPOSE;
  tenantId: string;
  userId: string;
};

export function generateGoogleCalendarOAuthState(tenantId: string, userId: string): string {
  return jwt.sign({ purpose: PURPOSE, tenantId, userId }, JWT_SECRET, {
    expiresIn: '10m',
  } as jwt.SignOptions);
}

export function verifyGoogleCalendarOAuthState(token: string): GoogleCalendarOAuthStatePayload {
  const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & {
    purpose?: string;
    tenantId?: string;
    userId?: string;
  };
  if (
    decoded.purpose !== PURPOSE ||
    typeof decoded.tenantId !== 'string' ||
    typeof decoded.userId !== 'string'
  ) {
    throw new Error('State OAuth inválido');
  }
  return {
    purpose: PURPOSE,
    tenantId: decoded.tenantId,
    userId: decoded.userId,
  };
}
