/**
 * P0-B.1 — Retomada do wizard /cadastro (URL step + plano do lead).
 */
export type PublicAcquisitionLeadSnapshot = {
    id: string;
    selected_plan_id?: string | null;
    current_stage?: string | null;
};
/** Mapeia query `step` → índice do wizard. */
export declare function stepIndexFromUrlStep(step: string | null | undefined): number;
export declare function hasPlanId(planId: string | null | undefined): boolean;
/**
 * Etapa efetiva após hardening: conversão exige plano; senão cai para plano (1).
 */
export declare function resolveWizardStepIndex(urlStep: string | null | undefined, selectedPlanId: string | null | undefined): number;
export type ResumeNavigationTarget = {
    pathname: string;
    search: string;
    stepIndex: number;
};
/**
 * Normaliza resume_path do backend (corrige conversion sem plano → step=plan).
 */
export declare function normalizeResumeNavigation(resumePath: string, selectedPlanId: string | null | undefined): ResumeNavigationTarget;
export declare function planIdFromLeadAndParams(lead: PublicAcquisitionLeadSnapshot | null | undefined, params: URLSearchParams): string;
export declare function shouldSkipSignupStepOnResume(action: string | undefined): boolean;
/** P0-D — banner só quando retomada verificada pelo backend. */
export declare function shouldShowResumeBanner(resumeVerified: boolean | undefined, message?: string | null): boolean;
export declare function isCadastroResumePath(path: string): boolean;
/**
 * Índice efetivo: URL `step` tem prioridade; sem step, infere pelo estágio do lead.
 */
export declare function resolveWizardStepFromLead(urlStep: string | null | undefined, lead: PublicAcquisitionLeadSnapshot | null | undefined): number;
//# sourceMappingURL=acquisitionSignupResume.d.ts.map