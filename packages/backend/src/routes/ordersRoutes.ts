import { Router } from 'express';
import * as ordersController from '../controllers/ordersController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/', ordersController.getOrders);
router.get('/:id', ordersController.getOrderById);
router.post('/', ordersController.createOrder);

export default router;


