import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';
import { pool } from '../utils/db.js';

export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
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
    
    // Verify user still exists
    const result = await pool.query(
      'SELECT id, email FROM users WHERE id = $1',
      [payload.userId]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    req.userId = payload.userId;
    req.user = result.rows[0];
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}


