type ProvisionLogKind = 'PROVISION' | 'REPAIR' | 'SYNCHRONIZE' | 'VALIDATE';

const PREFIX: Record<ProvisionLogKind, string> = {
  PROVISION: '[BILLING_PROVISION]',
  REPAIR: '[BILLING_REPAIR]',
  SYNCHRONIZE: '[BILLING_SYNCHRONIZE]',
  VALIDATE: '[BILLING_VALIDATE]',
};

export function logBillingProvision(
  kind: ProvisionLogKind,
  event: string,
  fields: Record<string, unknown> = {}
): void {
  console.log(`${PREFIX[kind]} ${event}`, fields);
}
