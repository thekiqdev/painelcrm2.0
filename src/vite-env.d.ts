/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHECKOUT_TRIAL_V1?: string;
  readonly VITE_CHECKOUT_RESUME_V1?: string;
  readonly VITE_FORCE_LEGACY_ONBOARDING_ROUTE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
