/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHECKOUT_TRIAL_V1?: string;
  readonly VITE_CHECKOUT_RESUME_V1?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
