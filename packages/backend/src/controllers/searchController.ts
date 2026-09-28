import { Request, Response } from 'express';
import { pool } from '../utils/db.js';

// GET /api/search?q=termo&types=clients,leads,contracts,products
export const searchGlobal = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId as string | null | undefined;
    if (!tenantId) {
      return res.json([]);
    }

    const { q, types } = req.query;
    
    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.json([]);
    }

    const searchTerm = `%${q.trim()}%`;
    const typeFilter = types ? (types as string).split(',') : ['clients', 'leads', 'contracts', 'products'];
    
    const results: any[] = [];

    // Buscar clientes (escopo tenant)
    if (typeFilter.includes('clients')) {
      const clientsResult = await pool.query(
        `SELECT c.id, c.name, c.email, c.company, 'Cliente' as type, '/clients' as route
         FROM clients c
         INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
         WHERE (c.name ILIKE $2 OR c.email ILIKE $2 OR c.company ILIKE $2)
         LIMIT 5`,
        [tenantId, searchTerm]
      );
      results.push(...clientsResult.rows);
    }

    // Buscar leads (escopo tenant)
    if (typeFilter.includes('leads')) {
      const leadsResult = await pool.query(
        `SELECT l.id, l.name, l.email, l.company, 'Lead' as type, '/leads' as route
         FROM leads l
         INNER JOIN users u ON u.id = l.user_id AND u.tenant_id = $1
         WHERE (l.name ILIKE $2 OR l.email ILIKE $2 OR l.company ILIKE $2)
         LIMIT 5`,
        [tenantId, searchTerm]
      );
      results.push(...leadsResult.rows);
    }

    // Buscar contratos (escopo tenant)
    if (typeFilter.includes('contracts')) {
      const contractsResult = await pool.query(
        `SELECT c.id, c.title as name, c.contract_number, 'Contrato' as type, 
                CONCAT('/contracts/', c.id) as route
         FROM contracts c
         INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
         WHERE (c.title ILIKE $2 OR c.contract_number ILIKE $2)
         LIMIT 5`,
        [tenantId, searchTerm]
      );
      results.push(...contractsResult.rows);
    }

    // Buscar produtos (escopo tenant)
    if (typeFilter.includes('products')) {
      const productsResult = await pool.query(
        `SELECT p.id, p.name, p.description, 'Produto' as type, '/products' as route
         FROM products p
         INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1
         WHERE (p.name ILIKE $2 OR p.description ILIKE $2)
         LIMIT 5`,
        [tenantId, searchTerm]
      );
      results.push(...productsResult.rows);
    }

    res.json(results);
  } catch (error) {
    console.error('Error in global search:', error);
    res.status(500).json({ error: 'Erro ao realizar busca' });
  }
};

