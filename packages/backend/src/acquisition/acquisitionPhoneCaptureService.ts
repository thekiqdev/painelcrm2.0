import { normalizeWhatsappDigits } from '../services/userIdentityValidationService.js';
import {
  findAcquisitionLeadById,
  findAcquisitionLeadByPhone,
  insertAcquisitionLead,
  mergeAcquisitionLeadMetadata,
  updateAcquisitionLeadStage,
} from './acquisitionLeadRepository.js';
import { pendingSignupEmailFromPhoneDigits } from './acquisitionPendingEmail.js';
import { publishAcquisitionLeadCreated } from './acquisitionOutbox.js';
import { logAcquisition } from './acquisitionLogger.js';
import type { AcquisitionLeadRow } from './acquisitionTypes.js';

export async function captureAcquisitionPhoneContact(input: {
  name: string;
  phone: string;
  leadId?: string;
  correlationId: string;
  source?: string;
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
    lead = await findAcquisitionLeadByPhone(phoneDigits);
  }

  if (lead) {
    const updated = await mergeAcquisitionLeadMetadata(lead.id, {
      last_seen_at: new Date().toISOString(),
      phone_capture_at: new Date().toISOString(),
    });
    lead =
      (await updateAcquisitionLeadStage(lead.id, 'contact_captured', {
        metadata: { last_step: 'phone_capture' },
      })) ??
      updated ??
      lead;

    await poolTouchNamePhone(lead.id, name, phoneDigits, input.correlationId);
    lead = (await findAcquisitionLeadById(lead.id)) ?? lead;

    void publishAcquisitionLeadCreated(lead);
    return { ok: true, lead };
  }

  const placeholderEmail = pendingSignupEmailFromPhoneDigits(phoneDigits);
  lead = await insertAcquisitionLead({
    name,
    email: placeholderEmail,
    phone: phoneDigits,
    correlationId: input.correlationId,
    source: input.source ?? 'web',
    stage: 'contact_captured',
    metadata: {
      operational_tags: ['novo'],
      phone_capture_at: new Date().toISOString(),
      email_pending: true,
    },
  });

  if (!lead) return { ok: false, reason: 'table_unavailable' };

  logAcquisition('phone_capture', {
    acquisition_lead_id: lead.id,
    phone_digits: phoneDigits,
    correlation_id: input.correlationId,
  });

  void publishAcquisitionLeadCreated(lead);
  return { ok: true, lead };
}

async function poolTouchNamePhone(
  leadId: string,
  name: string,
  phoneDigits: string,
  correlationId: string,
): Promise<void> {
  const { pool } = await import('../utils/db.js');
  await pool.query(
    `UPDATE acquisition_leads
     SET name = COALESCE(NULLIF($2, ''), name),
         phone = COALESCE($3, phone),
         correlation_id = $4,
         updated_at = now()
     WHERE id = $1`,
    [leadId, name, phoneDigits, correlationId],
  );
}
