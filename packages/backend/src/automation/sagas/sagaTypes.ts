export type SagaCompensationRegistration = {
  stepKey: string;
  compensationKey: string;
  metadata?: Record<string, unknown>;
  /** P0: registered only — never executed */
  execute?: false;
};

export type SagaInstanceRow = {
  id: string;
  saga_key: string;
  correlation_id: string;
  tenant_id: string | null;
  status: string;
  state_json: Record<string, unknown>;
  compensation_json: SagaCompensationRegistration[];
  rollback_metadata_json: Record<string, unknown>;
  shadow_mode: boolean;
};
