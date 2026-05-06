import jwt from 'jsonwebtoken';

const PURPOSE = 'google_drive_oauth' as const;

const JWT_SECRET: string = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

export type GoogleDriveOAuthStatePayload = {
  purpose: typeof PURPOSE;
  tenantId: string;
  initiatedByUserId: string;
};

export function generateGoogleDriveOAuthState(tenantId: string, initiatedByUserId: string): string {
  return jwt.sign({ purpose: PURPOSE, tenantId, initiatedByUserId }, JWT_SECRET, {
    expiresIn: '10m',
  } as jwt.SignOptions);
}

export function verifyGoogleDriveOAuthState(token: string): GoogleDriveOAuthStatePayload {
  const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & {
    purpose?: string;
    tenantId?: string;
    initiatedByUserId?: string;
  };
  if (
    decoded.purpose !== PURPOSE ||
    typeof decoded.tenantId !== 'string' ||
    typeof decoded.initiatedByUserId !== 'string'
  ) {
    throw new Error('State OAuth inválido');
  }
  return {
    purpose: PURPOSE,
    tenantId: decoded.tenantId,
    initiatedByUserId: decoded.initiatedByUserId,
  };
}
