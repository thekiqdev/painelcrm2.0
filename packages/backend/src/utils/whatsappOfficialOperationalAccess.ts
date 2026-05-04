import type { AuthRequest } from '../middleware/auth.js';
import {
  isWhatsappOfficialSuperadminEnabled,
  isWhatsappOfficialTenantEnabled,
} from '../config/whatsappOfficialEnv.js';

/** Lista / thread / envio no chat operacional (não confundir com hub Super Admin isolado). */
export function canAccessWhatsappOfficialOperationalChat(req: AuthRequest): boolean {
  if (req.user?.is_super_admin && isWhatsappOfficialSuperadminEnabled()) {
    return true;
  }
  return isWhatsappOfficialTenantEnabled();
}
