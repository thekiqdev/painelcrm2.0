import { Request, Response } from 'express';
import { pool } from '../utils/db.js';

// GET /api/search?q=termo&types=clients,leads,contracts,products
export const searchGlobal = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const { q, types } = req.query;
    
    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.json([]);
    }

    const searchTerm = `%${q.trim()}%`;
    const typeFilter = types ? (types as string).split(',') : ['clients', 'leads', 'contracts', 'products'];
    
    const results: any[] = [];

    // Buscar clientes
    if (typeFilter.includes('clients')) {
      const clientsResult = await pool.query(
        `SELECT id, name, email, company, 'Cliente' as type, '/clients' as route
         FROM clients
         WHERE user_id = $1
         AND (name ILIKE $2 OR email ILIKE $2 OR company ILIKE $2)
         LIMIT 5`,
        [userId, searchTerm]
      );
      results.push(...clientsResult.rows);
    }

    // Buscar leads
    if (typeFilter.includes('leads')) {
      const leadsResult = await pool.query(
        `SELECT id, name, email, company, 'Lead' as type, '/leads' as route
         FROM leads
         WHERE user_id = $1
         AND (name ILIKE $2 OR email ILIKE $2 OR company ILIKE $2)
         LIMIT 5`,
        [userId, searchTerm]
      );
      results.push(...leadsResult.rows);
    }

    // Buscar contratos
    if (typeFilter.includes('contracts')) {
      const contractsResult = await pool.query(
        `SELECT id, title as name, contract_number, 'Contrato' as type, 
                CONCAT('/contracts/', id) as route
         FROM contracts
         WHERE user_id = $1
         AND (title ILIKE $2 OR contract_number ILIKE $2)
         LIMIT 5`,
        [userId, searchTerm]
      );
      results.push(...contractsResult.rows);
    }

    // Buscar produtos
    if (typeFilter.includes('products')) {
      const productsResult = await pool.query(
        `SELECT id, name, description, 'Produto' as type, '/products' as route
         FROM products
         WHERE user_id = $1
         AND (name ILIKE $2 OR description ILIKE $2)
         LIMIT 5`,
        [userId, searchTerm]
      );
      results.push(...productsResult.rows);
    }

    res.json(results);
  } catch (error) {
    console.error('Error in global search:', error);
    res.status(500).json({ error: 'Erro ao realizar busca' });
  }
};

