/**
 * P0-B.1 — Retomada do wizard /cadastro (URL step + plano do lead).
 */
/** Mapeia query `step` → índice do wizard. */
export function stepIndexFromUrlStep(step) {
    if (step === 'plan')
        return 1;
    if (step === 'conversion' || step === 'activate')
        return 2;
    return 0;
}
export function hasPlanId(planId) {
    return Boolean(planId?.trim());
}
/**
 * Etapa efetiva após hardening: conversão exige plano; senão cai para plano (1).
 */
export function resolveWizardStepIndex(urlStep, selectedPlanId) {
    const rawIndex = stepIndexFromUrlStep(urlStep);
    const wantsConversion = urlStep === 'conversion' || urlStep === 'activate' || rawIndex === 2;
    if (wantsConversion && !hasPlanId(selectedPlanId)) {
        return 1;
    }
    return rawIndex;
}
/**
 * Normaliza resume_path do backend (corrige conversion sem plano → step=plan).
 */
export function normalizeResumeNavigation(resumePath, selectedPlanId) {
    const url = new URL(resumePath, 'http://resume.local');
    const step = url.searchParams.get('step');
    const stepIndex = resolveWizardStepIndex(step, selectedPlanId);
    if ((step === 'conversion' || step === 'activate') &&
        stepIndex === 1 &&
        !hasPlanId(selectedPlanId)) {
        url.searchParams.set('step', 'plan');
    }
    return {
        pathname: url.pathname,
        search: url.search,
        stepIndex,
    };
}
export function planIdFromLeadAndParams(lead, params) {
    const fromLead = lead?.selected_plan_id?.trim();
    if (fromLead)
        return fromLead;
    return params.get('plan')?.trim() ?? '';
}
export function shouldSkipSignupStepOnResume(action) {
    return action === 'continue_lead' || action === 'reactivation_eligible';
}
const CONTINUE_COPY = 'Continuando de onde você parou';
/** P0-D — banner só quando retomada verificada pelo backend. */
export function shouldShowResumeBanner(resumeVerified, message) {
    if (!message?.trim())
        return false;
    if (resumeVerified === true)
        return true;
    if (resumeVerified === false)
        return false;
    return !message.includes(CONTINUE_COPY);
}
export function isCadastroResumePath(path) {
    try {
        const url = new URL(path, 'http://resume.local');
        return url.pathname === '/cadastro' || url.pathname.endsWith('/cadastro');
    }
    catch {
        return path.includes('/cadastro');
    }
}
/**
 * Índice efetivo: URL `step` tem prioridade; sem step, infere pelo estágio do lead.
 */
export function resolveWizardStepFromLead(urlStep, lead) {
    if (urlStep) {
        return resolveWizardStepIndex(urlStep, lead?.selected_plan_id ?? null);
    }
    const stage = lead?.current_stage;
    if (stage === 'contact_captured')
        return 1;
    if (stage === 'plan_selected' ||
        stage === 'activation_prepared' ||
        stage === 'checkout_started') {
        return hasPlanId(lead?.selected_plan_id) ? 2 : 1;
    }
    return 0;
}
//# sourceMappingURL=acquisitionSignupResume.js.map