import { Request, Response } from 'express';
import { pool } from '../utils/db.js';
import { z } from 'zod';

const expenseSchema = z.object({
  project_id: z.string().uuid().optional().nullable(),
  description: z.string().min(1, 'Descrição é obrigatória'),
  amount: z.number().min(0, 'Valor deve ser positivo'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  category: z.string().optional().nullable(),
  is_paid: z.boolean().default(false),
  notes: z.string().optional().nullable(),
});

// GET /api/expenses
export const getExpenses = async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId as string | null | undefined;
    if (!tenantId) {
      return res.json([]);
    }

    const { project_id, category, is_paid, start_date, end_date } = req.query;

    let query = `
      SELECT e.id, e.project_id, e.description, e.amount, e.date, e.category,
             e.is_paid, e.notes, e.created_at, e.updated_at
      FROM expenses e
      INNER JOIN users u ON u.id = e.user_id AND u.tenant_id = $1
      WHERE 1=1
    `;
    const params: any[] = [tenantId];
    let paramCount = 2;

    if (project_id) {
      query += ` AND e.project_id = $${paramCount}`;
      params.push(project_id);
      paramCount++;
    }

    if (category) {
      query += ` AND e.category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }

    if (is_paid !== undefined) {
      query += ` AND e.is_paid = $${paramCount}`;
      params.push(is_paid === 'true');
      paramCount++;
    }

    if (start_date) {
      query += ` AND e.date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      query += ` AND e.date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    query += ` ORDER BY e.date DESC, e.created_at DESC`;

    const result = await pool.query(query, params);

    const expenses = result.rows.map(expense => ({
      ...expense,
      amount: parseFloat(expense.amount || '0'),
    }));

    res.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Erro ao buscar despesas' });
  }
};

// GET /api/expenses/:id
export const getExpenseById = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT e.id, e.project_id, e.description, e.amount, e.date, e.category,
              e.is_paid, e.notes, e.created_at, e.updated_at
       FROM expenses e
       INNER JOIN users u ON u.id = e.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
       WHERE e.id = $1`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Despesa não encontrada' });
    }

    const expense = {
      ...result.rows[0],
      amount: parseFloat(result.rows[0].amount || '0'),
    };

    res.json(expense);
  } catch (error) {
    console.error('Error fetching expense:', error);
    res.status(500).json({ error: 'Erro ao buscar despesa' });
  }
};

// POST /api/expenses
export const createExpense = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const validated = expenseSchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO expenses (
        user_id, project_id, description, amount, date, category,
        is_paid, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, project_id, description, amount, date, category,
                is_paid, notes, created_at, updated_at`,
      [
        userId,
        validated.project_id || null,
        validated.description,
        validated.amount,
        validated.date,
        validated.category || null,
        validated.is_paid,
        validated.notes || null,
      ]
    );

    const expense = {
      ...result.rows[0],
      amount: parseFloat(result.rows[0].amount || '0'),
    };

    res.status(201).json(expense);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating expense:', error);
    res.status(500).json({ error: 'Erro ao criar despesa' });
  }
};

// PATCH /api/expenses/:id
export const updateExpense = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const validated = expenseSchema.partial().parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (validated.project_id !== undefined) {
      updates.push(`project_id = $${paramCount++}`);
      values.push(validated.project_id || null);
    }
    if (validated.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(validated.description);
    }
    if (validated.amount !== undefined) {
      updates.push(`amount = $${paramCount++}`);
      values.push(validated.amount);
    }
    if (validated.date !== undefined) {
      updates.push(`date = $${paramCount++}`);
      values.push(validated.date);
    }
    if (validated.category !== undefined) {
      updates.push(`category = $${paramCount++}`);
      values.push(validated.category || null);
    }
    if (validated.is_paid !== undefined) {
      updates.push(`is_paid = $${paramCount++}`);
      values.push(validated.is_paid);
    }
    if (validated.notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(validated.notes || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(id, userId);
    const result = await pool.query(
      `UPDATE expenses
       SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${paramCount} AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $${paramCount + 1}))
       RETURNING id, project_id, description, amount, date, category,
                 is_paid, notes, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Despesa não encontrada' });
    }

    const expense = {
      ...result.rows[0],
      amount: parseFloat(result.rows[0].amount || '0'),
    };

    res.json(expense);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating expense:', error);
    res.status(500).json({ error: 'Erro ao atualizar despesa' });
  }
};

// DELETE /api/expenses/:id
export const deleteExpense = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM expenses
       WHERE id = $1 AND user_id IN (SELECT id FROM users WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = $2))
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Despesa não encontrada' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: 'Erro ao deletar despesa' });
  }
};

