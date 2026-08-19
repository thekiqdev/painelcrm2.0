/**
 * M5 Partner — auth middleware (S1).
 */

import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { isPartnerChannelEnabled } from './partnerFlags.js';
import {
  findPartnerMembershipForUser,
  getPartnerLicensePool,
  getPartnerProfile,
} from './partnerRepository.js';
import type { PartnerContext, PartnerMembershipRole } from './partnerTypes.js';

export type PartnerAuthRequest = AuthRequest & {
  partnerContext?: PartnerContext;
};

export async function requirePartnerChannelEnabled(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const enabled = await isPartnerChannelEnabled({
    tenantId: req.tenantId,
    userId: req.userId,
  });
  if (!enabled) {
    res.status(404).json({ error: 'Not found', code: 'PARTNER_CHANNEL_DISABLED' });
    return;
  }
  next();
}

function makeRequirePartnerRole(roles: PartnerMembershipRole[]) {
  return async (req: PartnerAuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      const membership = await findPartnerMembershipForUser(req.userId, { roles });
      if (!membership) {
        res.status(403).json({ error: 'Partner membership required', code: 'PARTNER_FORBIDDEN' });
        return;
      }
      if (membership.partner_status === 'suspended' && !req.user?.is_super_admin) {
        res.status(403).json({ error: 'Partner suspenso', code: 'PARTNER_SUSPENDED' });
        return;
      }
      const profile = await getPartnerProfile(membership.partner_tenant_id);
      if (!profile) {
        res.status(403).json({ error: 'Partner profile missing', code: 'PARTNER_PROFILE_MISSING' });
        return;
      }
      const pool = await getPartnerLicensePool(membership.partner_tenant_id);
      req.partnerContext = {
        partnerTenantId: membership.partner_tenant_id,
        membershipId: membership.id,
        role: membership.role,
        profile,
        pool,
      };
      req.tenantId = membership.partner_tenant_id;
      next();
    } catch (err) {
      console.error('[partnerAuth]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

export const requirePartnerAdmin = makeRequirePartnerRole(['partner_admin']);
export const requirePartnerSeller = makeRequirePartnerRole(['partner_seller']);
export const requirePartnerMember = makeRequirePartnerRole(['partner_admin', 'partner_seller']);
