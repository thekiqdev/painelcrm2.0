import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { hashPassword, comparePassword } from '../utils/bcrypt.js';
import { generateToken } from '../utils/jwt.js';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  whatsapp: z.string().optional(),
});

const loginSchema = z.object({
  identifier: z.string().min(1, 'Email ou telefone é obrigatório'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, whatsapp } = registerSchema.parse(req.body);

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, whatsapp_number)
       VALUES ($1, $2, $3)
       RETURNING id, email, created_at`,
      [email, passwordHash, whatsapp || null]
    );

    const user = userResult.rows[0];

    // Create profile
    await pool.query(
      `INSERT INTO profiles (id, whatsapp_number, registration_complete)
       VALUES ($1, $2, false)`,
      [user.id, whatsapp || '']
    );

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
      },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { identifier, password } = loginSchema.parse(req.body);

    // Determine if identifier is email or phone number
    // Email contains @, phone number is numeric (may contain +, spaces, dashes, parentheses)
    const isEmail = identifier.includes('@');
    
    let userResult;
    if (isEmail) {
      // Search by email
      userResult = await pool.query(
        'SELECT id, email, password_hash, whatsapp_number FROM users WHERE email = $1',
        [identifier.toLowerCase().trim()]
      );
    } else {
      // Search by WhatsApp number (normalize phone number)
      // Remove common phone formatting characters
      const normalizedPhone = identifier.replace(/[\s\-\(\)\+]/g, '');
      userResult = await pool.query(
        'SELECT id, email, password_hash, whatsapp_number FROM users WHERE whatsapp_number = $1 OR whatsapp_number = $2',
        [identifier, normalizedPhone]
      );
    }

    if (userResult.rows.length === 0) {
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }

    const user = userResult.rows[0];

    // Check if user has a password hash
    if (!user.password_hash) {
      console.error('User found but has no password_hash:', user.id);
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }

    // Verify password
    console.log('Attempting login for:', identifier);
    console.log('User found:', user.email);
    console.log('Password hash exists:', !!user.password_hash);
    console.log('Password hash length:', user.password_hash?.length);
    
    const isValid = await comparePassword(password, user.password_hash);
    console.log('Password comparison result:', isValid);
    
    if (!isValid) {
      console.error('Password validation failed for user:', user.email);
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }

    // Get profile to check registration_complete
    const profileResult = await pool.query(
      'SELECT registration_complete, first_name, last_name, company_name FROM profiles WHERE id = $1',
      [user.id]
    );

    const profile = profileResult.rows[0] || {};

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        whatsapp_number: user.whatsapp_number,
        registration_complete: profile.registration_complete || false,
        first_name: profile.first_name,
        last_name: profile.last_name,
        company_name: profile.company_name,
      },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Erro de validação', details: error.errors });
      return;
    }
    console.error('Login error:', error);
    console.error('Login error stack:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: error instanceof Error ? error.message : 'Unknown error',
      // Em desenvolvimento, incluir mais detalhes
      ...(process.env.NODE_ENV !== 'production' && { 
        stack: error instanceof Error ? error.stack : undefined 
      })
    });
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as any;
    const userId = authReq.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get user with profile
    const userResult = await pool.query(
      `SELECT u.id, u.email, u.whatsapp_number, u.created_at,
              p.first_name, p.last_name, p.company_name, 
              p.whatsapp_connected, p.registration_complete
       FROM users u
       LEFT JOIN profiles p ON u.id = p.id
       WHERE u.id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = userResult.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      whatsapp_number: user.whatsapp_number,
      first_name: user.first_name,
      last_name: user.last_name,
      company_name: user.company_name,
      whatsapp_connected: user.whatsapp_connected,
      registration_complete: user.registration_complete,
      created_at: user.created_at,
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  // With JWT, logout is handled client-side by removing the token
  // Optionally, we could implement a token blacklist here
  res.json({ message: 'Logged out successfully' });
}


