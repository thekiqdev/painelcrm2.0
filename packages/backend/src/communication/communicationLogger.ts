type Payload = Record<string, unknown>;

function emit(prefix: string, msg: string, payload: Payload = {}): void {
  console.log(JSON.stringify({ prefix, msg, ...payload, ts: new Date().toISOString() }));
}

export function logCommunication(msg: string, payload?: Payload): void {
  emit('[COMMUNICATION]', msg, payload);
}

export function logProvider(msg: string, payload?: Payload): void {
  emit('[PROVIDER]', msg, payload);
}

export function logWebhook(msg: string, payload?: Payload): void {
  emit('[WEBHOOK]', msg, payload);
}

export function logCommunicationRouting(msg: string, payload?: Payload): void {
  emit('[COMMUNICATION_ROUTING]', msg, payload);
}

export function logCommunicationBridge(msg: string, payload?: Payload): void {
  emit('[COMMUNICATION_BRIDGE]', msg, payload);
}
