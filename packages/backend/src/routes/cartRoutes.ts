import { Router } from 'express';
import * as cartController from '../controllers/cartController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/:storeUserId', authenticateToken, cartController.getOrCreateCart);
router.get('/:storeUserId/items', authenticateToken, cartController.getCartItems);
router.post('/:storeUserId/items', authenticateToken, cartController.addToCart);
router.patch('/items/:itemId', authenticateToken, cartController.updateCartItem);
router.delete('/items/:itemId', authenticateToken, cartController.removeCartItem);
router.delete('/:storeUserId', authenticateToken, cartController.clearCart);

export default router;


