/**
 * Erros padronizados do Permission Engine.
 *
 * ModulePermissionError é a única definição neste arquivo. Controllers podem
 * importar de `permissions/index.js` ou de `modulePermissionsService` (reexport);
 * ambos expõem a mesma classe, garantindo que `instanceof ModulePermissionError` funcione.
 */
export class ModulePermissionError extends Error {
  constructor(
    public readonly statusCode: number = 403,
    message: string
  ) {
    super(message);
    this.name = 'ModulePermissionError';
  }
}
