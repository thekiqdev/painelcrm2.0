import { WhatsappMessageTemplatesPanel } from '@/components/settings/WhatsappMessageTemplatesPanel';

/** Secção própria em Configurações: Templates WhatsApp (sequências automáticas por tenant). */
export function ChatTemplatesSettingsSection() {
  return (
    <div className="space-y-6">
      <WhatsappMessageTemplatesPanel />
    </div>
  );
}
