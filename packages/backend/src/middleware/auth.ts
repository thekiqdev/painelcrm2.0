import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';
import { pool } from '../utils/db.js';
import { userHasFeature } from '../services/featureFlagService.js';

export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
    is_super_admin?: boolean;
  };
}

export async function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({ error: 'Authentication token required' });
      return;
    }

    const payload = verifyToken(token);
    
    // Verify user still exists and get is_super_admin
    const result = await pool.query(
      'SELECT id, email, is_super_admin FROM users WHERE id = $1',
      [payload.userId]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const row = result.rows[0];
    req.userId = row.id;
    req.user = {
      id: row.id,
      email: row.email,
      is_super_admin: row.is_super_admin === true,
    };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware que exige que o usuário seja Super Admin.
 * Deve ser usado após authenticateToken nas rotas /api/superadmin.
 */
export function requireSuperAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user?.is_super_admin) {
    res.status(403).json({ error: 'Acesso restrito a Super Admin' });
    return;
  }
  next();
}

/**
 * Middleware que exige que o usuário tenha a feature indicada (plano/tenant).
 * Usar após authenticateToken. Retorna 403 se não tiver a feature.
 */
export function requireFeature(featureKey: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    try {
      const has = await userHasFeature(req.userId, featureKey);
      if (!has) {
        res.status(403).json({ error: `Recurso não disponível no seu plano: ${featureKey}` });
        return;
      }
      next();
    } catch (e) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}


