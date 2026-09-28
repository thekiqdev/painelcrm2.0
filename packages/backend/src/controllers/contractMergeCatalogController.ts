import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import {
  CONTRACT_MERGE_FIELD_CATEGORIES,
  CONTRACT_MERGE_LEGACY_ALIASES,
} from '../utils/contractMergeFieldCatalog.js';

/** Catálogo de merge fields para o editor (mesma fonte que documentação interna). */
export function getContractMergeFieldCatalog(_req: AuthRequest, res: Response): void {
  res.json({
    categories: CONTRACT_MERGE_FIELD_CATEGORIES,
    legacy_aliases: CONTRACT_MERGE_LEGACY_ALIASES,
  });
}
