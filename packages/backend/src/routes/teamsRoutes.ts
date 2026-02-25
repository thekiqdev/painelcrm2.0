import { Router } from 'express';
import {
  getTeams,
  getTeamById,
  createTeam,
  updateTeam,
  deleteTeam,
  getTeamMembers,
  addTeamMember,
  removeTeamMember,
  getUserTeams,
  setUserTeams,
} from '../controllers/teamsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

router.get('/', getTeams);
router.post('/', createTeam);

router.get('/by-user/:userId', getUserTeams);
router.put('/by-user/:userId', setUserTeams);

router.get('/:teamId/members', getTeamMembers);
router.post('/:teamId/members', addTeamMember);
router.delete('/:teamId/members/:memberId', removeTeamMember);

router.get('/:id', getTeamById);
router.patch('/:id', updateTeam);
router.delete('/:id', deleteTeam);

export default router;
