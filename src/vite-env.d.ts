/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHECKOUT_TRIAL_V1?: string;
  readonly VITE_CHECKOUT_RESUME_V1?: string;
  readonly VITE_FORCE_LEGACY_ONBOARDING_ROUTE?: string;
  /** Fase 8 — mostrar configuração do chatbot em Configurações (requer `CHAT_AUTOMATION_ENABLED` no backend). */
  readonly VITE_CHAT_AUTOMATION_ENABLED?: string;
  /** Logs de diagnóstico no consola (mídia/avatar no chat). */
  readonly VITE_CHAT_MEDIA_DEBUG?: string;
  /** Logs de diagnóstico da pipeline de avatar (URL bruta vs bloqueio WhatsApp no browser). */
  readonly VITE_CHAT_AVATAR_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
