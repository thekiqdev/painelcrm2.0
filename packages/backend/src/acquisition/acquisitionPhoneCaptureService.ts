import { normalizeWhatsappDigits } from '../services/userIdentityValidationService.js';
import {
  findAcquisitionLeadById,
  findAcquisitionLeadByPhoneVariants,
  insertAcquisitionLead,
  mergeAcquisitionLeadMetadata,
  updateAcquisitionLeadStage,
} from './acquisitionLeadRepository.js';
import { pendingSignupEmailFromPhoneDigits } from './acquisitionPendingEmail.js';
import {
  publishAcquisitionLeadCreated,
  publishAcquisitionStageChanged,
  syncAcquisitionLeadOpsKanbanProfile,
} from './acquisitionOutbox.js';
import { logAcquisition } from './acquisitionLogger.js';
import type { AcquisitionLeadRow } from './acquisitionTypes.js';
import {
  normalizeCaptureNameForStorage,
  resolveLeadNameAfterCapture,
} from './acquisitionCapturePlaceholder.js';

const QUALIFIED_STAGE = 'qualified' as const;

export async function captureAcquisitionPhoneContact(input: {
  name: string;
  phone: string;
  leadId?: string;
  correlationId: string;
  source?: string;
  partnerId?: string | null;
  sellerUserId?: string | null;
  sellerReferralCode?: string | null;
}): Promise<{ ok: boolean; lead?: AcquisitionLeadRow; reason?: string }> {
  const phoneDigits = normalizeWhatsappDigits(input.phone);
  if (!phoneDigits || phoneDigits.length < 10) {
    return { ok: false, reason: 'invalid_phone' };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, reason: 'invalid_name' };

  let lead: AcquisitionLeadRow | null = null;
  if (input.leadId) {
    lead = await findAcquisitionLeadById(input.leadId);
  }
  if (!lead) {
    lead = await findAcquisitionLeadByPhoneVariants(phoneDigits);
  }

  if (lead) {
    const previousStage = lead.current_stage;
    const updated = await mergeAcquisitionLeadMetadata(lead.id, {
      last_seen_at: new Date().toISOString(),
      phone_capture_at: new Date().toISOString(),
      phone_verified_at: new Date().toISOString(),
    });
    lead =
      (await updateAcquisitionLeadStage(lead.id, QUALIFIED_STAGE, {
        metadata: { last_step: 'phone_capture' },
      })) ??
      updated ??
      lead;

    if (input.partnerId || input.sellerUserId) {
      const { applyPartnerAttributionToLead } = await import('./acquisitionLeadRepository.js');
      await applyPartnerAttributionToLead(lead.id, {
        partner_id: input.partnerId ?? null,
        seller_user_id: input.sellerUserId ?? null,
        seller_referral_code: input.sellerReferralCode ?? null,
      });
      lead = (await findAcquisitionLeadById(lead.id)) ?? lead;
    }

    if (previousStage !== QUALIFIED_STAGE) {
      void publishAcquisitionStageChanged(lead, previousStage);
    }

    await poolTouchNamePhone(lead.id, name, phoneDigits, input.correlationId, lead.name);
    lead = (await findAcquisitionLeadById(lead.id)) ?? lead;

    void syncAcquisitionLeadOpsKanbanProfile(lead, { timelineType: 'phone_re_capture' });
    return { ok: true, lead };
  }

  const placeholderEmail = pendingSignupEmailFromPhoneDigits(phoneDigits);
  const storedName = normalizeCaptureNameForStorage(name);
  lead = await insertAcquisitionLead({
    name: storedName,
    email: placeholderEmail,
    phone: phoneDigits,
    correlationId: input.correlationId,
    source: input.source ?? 'web',
    stage: QUALIFIED_STAGE,
    partnerId: input.partnerId ?? null,
    sellerUserId: input.sellerUserId ?? null,
    sellerReferralCode: input.sellerReferralCode ?? null,
    metadata: {
      operational_tags: ['novo'],
      phone_capture_at: new Date().toISOString(),
      phone_verified_at: new Date().toISOString(),
      email_pending: true,
    },
  });

  if (!lead) return { ok: false, reason: 'table_unavailable' };

  logAcquisition('phone_capture', {
    acquisition_lead_id: lead.id,
    phone_digits: phoneDigits,
    correlation_id: input.correlationId,
    stage: QUALIFIED_STAGE,
  });

  void publishAcquisitionLeadCreated(lead);
  return { ok: true, lead };
}

async function poolTouchNamePhone(
  leadId: string,
  name: string,
  phoneDigits: string,
  correlationId: string,
  existingName: string | null,
): Promise<void> {
  const resolvedName = resolveLeadNameAfterCapture(existingName, name);
  const { pool } = await import('../utils/db.js');
  await pool.query(
    `UPDATE acquisition_leads
     SET name = COALESCE($2, name),
         phone = COALESCE($3, phone),
         correlation_id = $4,
         updated_at = now()
     WHERE id = $1`,
    [leadId, resolvedName, phoneDigits, correlationId],
  );
}
