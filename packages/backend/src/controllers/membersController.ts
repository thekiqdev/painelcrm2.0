import { Request, Response } from 'express';
import { pool } from '../utils/db.js';

// GET /api/members
// Retorna todos os membros disponíveis para o usuário (incluindo o próprio usuário e membros dos perfis)
export const getMembers = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Buscar o próprio usuário
    const currentUser = await pool.query(
      `SELECT u.id, u.email, p.first_name, p.last_name
       FROM users u
       LEFT JOIN profiles p ON p.id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    // Buscar membros dos perfis do usuário
    const profileMembers = await pool.query(
      `SELECT DISTINCT u.id, u.email, p.first_name, p.last_name
       FROM profile_members pm
       INNER JOIN users u ON pm.user_id = u.id
       LEFT JOIN profiles p ON p.id = u.id
       INNER JOIN user_profiles up ON pm.profile_id = up.id
       WHERE up.owner_id = $1
       ORDER BY p.first_name, p.last_name, u.email`,
      [userId]
    );

    // Combinar e formatar membros
    const allMembers = [];
    
    // Adicionar o próprio usuário
    if (currentUser.rows.length > 0) {
      const user = currentUser.rows[0];
      const name = user.first_name && user.last_name
        ? `${user.first_name} ${user.last_name}`.trim()
        : user.email?.split('@')[0] || 'Usuário';
      allMembers.push({
        id: user.id,
        name,
        email: user.email,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
      });
    }

    // Adicionar outros membros (evitando duplicatas)
    const memberIds = new Set([userId]);
    profileMembers.rows.forEach((member: any) => {
      if (!memberIds.has(member.id)) {
        memberIds.add(member.id);
        const name = member.first_name && member.last_name
          ? `${member.first_name} ${member.last_name}`.trim()
          : member.email?.split('@')[0] || 'Usuário';
        allMembers.push({
          id: member.id,
          name,
          email: member.email,
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
        });
      }
    });

    res.json(allMembers);
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Erro ao buscar membros' });
  }
};

