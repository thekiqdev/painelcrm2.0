import { Router } from 'express';
import * as productsController from '../controllers/productsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Protected routes
router.get('/', authenticateToken, productsController.getProducts);
router.get('/:id', authenticateToken, productsController.getProductById);
router.post('/', authenticateToken, productsController.createProduct);
router.patch('/:id', authenticateToken, productsController.updateProduct);
router.delete('/:id', authenticateToken, productsController.deleteProduct);

// Public routes
router.get('/public/:userId', productsController.getPublicProducts);

export default router;

