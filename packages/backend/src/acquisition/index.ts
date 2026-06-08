export * from './acquisitionFlags.js';
export * from './acquisitionTypes.js';
export { createPreSignupLead, orchestrateSignupStep } from './signupOrchestrationService.js';
export { orchestrateTesteGratis } from './trialOrchestrationService.js';
export { markAcquisitionAbandoned, evaluateRecoveryEligibility } from './acquisitionRecoveryService.js';
export { trackActivationEvent } from './activationTrackingService.js';
export { refreshActivationScoreForLead, computeActivationScore } from './activationScoreService.js';
export { kickoffOnboarding } from './onboardingKickoffService.js';
