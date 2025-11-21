import { Router } from 'express';
import * as ordersController from '../controllers/ordersController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, ordersController.getOrders);
router.get('/:id', authenticateToken, ordersController.getOrderById);
router.post('/', authenticateToken, ordersController.createOrder);

export default router;


