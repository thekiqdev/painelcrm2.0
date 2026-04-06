import { Router } from 'express';
import * as cartController from '../controllers/cartController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();
router.use(...tenantAuthCrm);

router.get('/:storeUserId', cartController.getOrCreateCart);
router.get('/:storeUserId/items', cartController.getCartItems);
router.post('/:storeUserId/items', cartController.addToCart);
router.patch('/items/:itemId', cartController.updateCartItem);
router.delete('/items/:itemId', cartController.removeCartItem);
router.delete('/:storeUserId', cartController.clearCart);

export default router;


