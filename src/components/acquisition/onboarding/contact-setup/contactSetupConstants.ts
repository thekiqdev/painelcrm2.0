import { Lock, MessageCircle, Settings } from 'lucide-react';

export const CONTACT_CTA = {
  label: 'Preparar meu workspace',
  subtitle: 'Criamos seu acesso e guiamos a configuração da operação nas próximas etapas.',
};

export const CONTACT_ACCESS_CTA = {
  label: 'Receber código de acesso',
  subtitle: 'Enviaremos o código pelo WhatsApp informado. Vagas liberadas gradualmente.',
};

export const CONTACT_VERIFICATION_CTA = {
  label: 'Continuar',
  subtitle: 'O código foi enviado para o WhatsApp informado.',
};

/** Sprint E1.1 — três cards informativos (sem IA Assist). */
export const CONTACT_TRUST_INDICATORS = [
  {
    icon: MessageCircle,
    text: 'O código de acesso será enviado para o WhatsApp informado.',
  },
  {
    icon: Lock,
    text: 'Seu ambiente será preparado após a ativação.',
  },
  {
    icon: Settings,
    text: 'As configurações poderão ser ajustadas posteriormente.',
  },
] as const;
