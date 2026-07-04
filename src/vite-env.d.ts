/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Build da landing estática (HTML separado); "1" só no vite.landing.config. */
  readonly VITE_LANDING_STANDALONE?: string;
  readonly VITE_CHECKOUT_TRIAL_V1?: string;
  readonly VITE_CHECKOUT_RESUME_V1?: string;
  readonly VITE_FORCE_LEGACY_ONBOARDING_ROUTE?: string;
  /** Fase 8 — mostrar configuração do chatbot em Configurações (requer `CHAT_AUTOMATION_ENABLED` no backend). */
  readonly VITE_CHAT_AUTOMATION_ENABLED?: string;
  /** Logs de diagnóstico no consola (mídia/avatar no chat). */
  readonly VITE_CHAT_MEDIA_DEBUG?: string;
  /** Logs de diagnóstico da pipeline de avatar (URL bruta vs bloqueio WhatsApp no browser). */
  readonly VITE_CHAT_AVATAR_DEBUG?: string;
  /** Sprint 5.0-21 — Shadow Mode: executa BillingAggregate em paralelo ao FinancialEventStore (default off). */
  readonly VITE_BILLING_SHADOW_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
