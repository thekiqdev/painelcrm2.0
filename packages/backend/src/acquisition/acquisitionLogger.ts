type Payload = Record<string, unknown>;

function emit(prefix: string, msg: string, payload: Payload = {}): void {
  console.log(JSON.stringify({ prefix, msg, ...payload, ts: new Date().toISOString() }));
}

export function logAcquisition(msg: string, payload?: Payload): void {
  emit('[ACQUISITION]', msg, payload);
}

export function logSignup(msg: string, payload?: Payload): void {
  emit('[SIGNUP]', msg, payload);
}

export function logTrial(msg: string, payload?: Payload): void {
  emit('[TRIAL]', msg, payload);
}

export function logRecovery(msg: string, payload?: Payload): void {
  emit('[RECOVERY]', msg, payload);
}

export function logActivation(msg: string, payload?: Payload): void {
  emit('[ACTIVATION]', msg, payload);
}

export function logOnboarding(msg: string, payload?: Payload): void {
  emit('[ONBOARDING]', msg, payload);
}

export function logOnboardingCompany(msg: string, payload?: Payload): void {
  emit('[onboarding-company]', msg, payload);
}

export function logCheckout(msg: string, payload?: Payload): void {
  emit('[CHECKOUT]', msg, payload);
}
