import { Bot, MessageCircle, Pencil, ShieldCheck, Sparkles, Zap } from 'lucide-react';

export const CONTACT_CTA = {
  label: 'Preparar meu workspace',
  subtitle: 'Criamos seu acesso e guiamos a configuração da operação nas próximas etapas.',
};

export const CONTACT_TRUST_INDICATORS = [
  {
    icon: MessageCircle,
    text: 'WhatsApp será usado para login e recovery da operação',
  },
  {
    icon: Bot,
    text: 'IA Assist será configurada automaticamente no workspace',
  },
  {
    icon: Pencil,
    text: 'Você pode alterar estes dados depois, quando quiser',
  },
] as const;

export const CONTACT_ENABLED_RESOURCES = [
  { icon: MessageCircle, label: 'Canal WhatsApp operacional' },
  { icon: Zap, label: 'Automações inteligentes' },
  { icon: Bot, label: 'IA Assist Preview' },
  { icon: Sparkles, label: 'CRM com visão unificada' },
  { icon: ShieldCheck, label: 'Recovery e onboarding por WhatsApp' },
] as const;
