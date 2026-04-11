import { Router } from 'express';
import * as productsController from '../controllers/productsController.js';
import { tenantAuthCrm } from '../middleware/auth.js';

const router = Router();

// Public routes (sem auth) — rotas mais específicas primeiro
router.get(
  '/public/store/:slug/product/:productId',
  productsController.getPublicProductByStoreSlugAndProductId
);
router.get('/public/:userId', productsController.getPublicProducts);

// Protected routes (auth + tenant)
router.use(...tenantAuthCrm);
router.get('/', productsController.getProducts);
router.get('/:id', productsController.getProductById);
router.post('/', productsController.createProduct);
router.patch('/:id', productsController.updateProduct);
router.delete('/:id', productsController.deleteProduct);

export default router;

