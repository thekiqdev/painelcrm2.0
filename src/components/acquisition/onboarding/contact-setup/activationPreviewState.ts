import type { LeadCaptureSubStep } from './ContactSetupStep';
import {
  ACTIVATION_TIMELINE_ITEMS,
  type ActivationLiveState,
  type ActivationTimelineEntry,
  type ActivationTimelineItem,
  type ActivationTimelineItemId,
  type ActivationTimelineStage,
  timelineLiveItemsForStage,
} from './activationPreviewTypes';

export function isDisplayableSignupEmail(email: string): boolean {
  const t = email.trim().toLowerCase();
  if (!t || !t.includes('@')) return false;
  return !t.includes('pending+') && !t.includes('@signup.painelcrm.local');
}

export function formatSignupPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return '';
  const national = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  const ddd = national.slice(0, 2);
  const rest = national.slice(2);
  const formatted =
    rest.length > 8
      ? `${rest.slice(0, 5)}-${rest.slice(5, 9)}`
      : rest.length > 4
        ? `${rest.slice(0, 4)}-${rest.slice(4)}`
        : rest;
  return `+55 (${ddd}) ${formatted}`;
}

/** Quantos itens já concluídos por etapa — nunca adiantar além do estágio atual. */
function stageCompletedCount(
  stage: ActivationTimelineStage,
  opts: {
    phoneDigits: string;
    phoneVerified?: boolean;
    subStep?: LeadCaptureSubStep;
    adminFormComplete?: boolean;
  },
): number {
  switch (stage) {
    case 'contact':
      if (opts.adminFormComplete) return 2;
      if (opts.phoneVerified || opts.subStep === 'admin') return 1;
      return 0;
    case 'operation':
      return 2;
    case 'prepare_workspace':
      return 4;
    case 'final':
      return ACTIVATION_TIMELINE_ITEMS.length;
    default:
      return 0;
  }
}

function labelForState(item: ActivationTimelineItem, state: ActivationLiveState): string {
  if (state === 'completed') return item.labelCompleted;
  if (state === 'in_progress') {
    const base = item.labelInProgress;
    return base.endsWith('...') ? base : `${base}...`;
  }
  return item.labelFuture;
}

/**
 * Uma entrada `in_progress` por vez; concluídos só até o permitido na etapa.
 */
export function deriveLiveTimelineEntries(
  stage: ActivationTimelineStage,
  opts?: {
    phoneDigits?: string;
    phoneVerified?: boolean;
    subStep?: LeadCaptureSubStep;
    name?: string;
    email?: string;
    adminFormComplete?: boolean;
    /** Override futuro por item. */
    stateOverrides?: Partial<Record<ActivationTimelineItemId, ActivationLiveState>>;
  },
): ActivationTimelineEntry[] {
  const phoneDigits = opts?.phoneDigits ?? '';
  const items = timelineLiveItemsForStage(stage);
  const completedCount = stageCompletedCount(stage, {
    phoneDigits,
    phoneVerified: opts?.phoneVerified,
    subStep: opts?.subStep,
    adminFormComplete: opts?.adminFormComplete,
  });

  return items.map((item, index) => {
    const override = opts?.stateOverrides?.[item.id];
    if (override) {
      return { id: item.id, state: override, label: labelForState(item, override) };
    }

    let state: ActivationLiveState;
    if (index < completedCount) {
      state = 'completed';
    } else if (index === completedCount) {
      state = 'in_progress';
    } else {
      state = 'future';
    }

    if (
      stage === 'contact' &&
      completedCount === 0 &&
      index === 0 &&
      phoneDigits.length >= 10 &&
      !opts?.phoneVerified
    ) {
      state = 'in_progress';
    }

    if (opts?.phoneVerified && item.id === 'whatsapp_access' && state === 'completed') {
      return {
        id: item.id,
        state,
        label: 'WhatsApp validado',
      };
    }

    if (item.id === 'admin_defined' && state === 'completed') {
      return {
        id: item.id,
        state,
        label: 'Administrador principal definido',
      };
    }

    return {
      id: item.id,
      state,
      label: labelForState(item, state),
    };
  });
}
