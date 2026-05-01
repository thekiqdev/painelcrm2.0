import React from 'react';
import { AlertCircle, Check, CheckCheck, Clock3 } from 'lucide-react';

type UiMessageStatus = 'queued' | 'provider_sent' | 'delivered' | 'read' | 'failed' | 'unknown';

function toUiStatus(raw: string | null | undefined): UiMessageStatus {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'unknown';
  if (s === 'queued' || s === 'pending' || s === 'sending') return 'queued';
  if (s === 'provider_sent' || s === 'sent' || s === 'server_ack') return 'provider_sent';
  if (s === 'delivered' || s === 'delivery' || s === 'received') return 'delivered';
  if (s === 'read' || s === 'seen') return 'read';
  if (s === 'failed' || s === 'error' || s === 'undelivered') return 'failed';
  return 'unknown';
}

const LABELS: Record<UiMessageStatus, string> = {
  queued: 'Enviando',
  provider_sent: 'Enviada',
  delivered: 'Entregue',
  read: 'Lida',
  failed: 'Falha no envio',
  unknown: 'Status desconhecido',
};

export const MessageStatusIndicator: React.FC<{
  status?: string | null;
  className?: string;
}> = ({ status, className }) => {
  const s = toUiStatus(status);
  const label = LABELS[s];

  if (s === 'queued') {
    return <Clock3 className={className} aria-label={label} title={label} />;
  }
  if (s === 'provider_sent') {
    return <Check className={className} aria-label={label} title={label} />;
  }
  if (s === 'delivered') {
    return (
      <CheckCheck
        className={`${className} shrink-0 opacity-70`}
        aria-label={label}
        title={label}
      />
    );
  }
  if (s === 'read') {
    return (
      <CheckCheck
        className={`${className} shrink-0 text-sky-200 dark:text-sky-400`}
        aria-label={label}
        title={label}
      />
    );
  }
  if (s === 'failed') {
    return (
      <AlertCircle
        className={`${className} text-destructive`}
        aria-label={label}
        title={label}
      />
    );
  }
  return null;
};

