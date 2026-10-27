import { appLogger } from '../observability/appLogger.js';

/** Registro de uso: só id da chave, rota e status. Sem corpo, sem segredo, sem header. */
export function logApiV1Request(input: { keyId: string | null; route: string; status: number }): void {
  appLogger.info('api-keys', 'request', {
    key_id: input.keyId,
    route: input.route,
    status: input.status,
  });
}
