# Billing Migration Internal Tools

**Status:** Archived (Sprint 3.2B)  
**Not used by CRM production renewal pipeline.**

Modules moved here during Billing Engine 3.0 housekeeping:

- `billingShadow/` — historical shadow reports (superadmin read-only)
- `billingCutover/` — cutover decision tooling
- `billingMigrationReadiness/` — pre-migration readiness
- `billingMigrationSimulator/` — migration simulation
- `billingPipelineCertification/` — V1 vs V2 certification (historical)
- `billingCertification/` — certification suite
- `billingCertificationLab/` — lab/regression scenarios

Production CRM billing uses only:

`billingEngine/`, `billingExecution/`, `billingExecutionContext/`, `billingObservability/`
