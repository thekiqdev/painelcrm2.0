import { Check, Loader2, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { WhatsappActivationComplete } from './WhatsappActivationComplete';
import type { WhatsappConnectionPhase, WhatsappConnectedProfile } from './useWhatsappOnboardingConnection';

const PHASE_LABELS: Record<WhatsappConnectionPhase, string | null> = {
  idle: null,
  aguardando: 'Aguardando leitura do QR Code',
  conectando: 'Conectando…',
  conectado: 'Conectado',
  erro: 'Erro na conexão',
};

const CONNECT_BENEFITS = [
  'Receber mensagens no CRM',
  'Enviar notificações automáticas',
  'Distribuir atendimentos entre operadores',
  'Centralizar conversas da equipe',
] as const;

type Props = {
  activated: boolean;
  adminName: string;
  companyName: string;
  logoLight: string | null;
  logoDark: string | null;
  teamStepEnabled: boolean;
  connectionName: string;
  onConnectionNameChange: (value: string) => void;
  phase: WhatsappConnectionPhase;
  qrCode: string | null;
  waProfile: WhatsappConnectedProfile | null;
  errorMessage: string | null;
  starting: boolean;
  finishing: boolean;
  onEnterDashboard: () => void;
  onStartWhatsapp: () => void;
  onEnterWithoutConnect: () => void;
};

export function WhatsappFinalizationStep({
  activated,
  adminName,
  companyName,
  logoLight,
  logoDark,
  teamStepEnabled,
  connectionName,
  onConnectionNameChange,
  phase,
  qrCode,
  waProfile,
  errorMessage,
  starting,
  finishing,
  onEnterDashboard,
  onStartWhatsapp,
  onEnterWithoutConnect,
}: Props) {
  if (activated && waProfile?.connected) {
    return (
      <WhatsappActivationComplete
        adminName={adminName}
        companyName={companyName}
        logoLight={logoLight}
        logoDark={logoDark}
        waProfile={waProfile}
        teamStepEnabled={teamStepEnabled}
        finishing={finishing}
        onEnterDashboard={onEnterDashboard}
      />
    );
  }

  const showQrSection = phase !== 'idle' || Boolean(qrCode);
  const phaseLabel = PHASE_LABELS[phase];

  return (
    <div className="space-y-4">
      <WhatsappPrimaryCard
        connectionName={connectionName}
        onConnectionNameChange={onConnectionNameChange}
        phase={phase}
        phaseLabel={phaseLabel}
        qrCode={qrCode}
        errorMessage={errorMessage}
        starting={starting}
        showQrSection={showQrSection}
        onStartWhatsapp={onStartWhatsapp}
        onEnterWithoutConnect={onEnterWithoutConnect}
      />
    </div>
  );
}

function WhatsappPrimaryCard({
  connectionName,
  onConnectionNameChange,
  phase,
  phaseLabel,
  qrCode,
  errorMessage,
  starting,
  showQrSection,
  onStartWhatsapp,
  onEnterWithoutConnect,
}: {
  connectionName: string;
  onConnectionNameChange: (value: string) => void;
  phase: WhatsappConnectionPhase;
  phaseLabel: string | null;
  qrCode: string | null;
  errorMessage: string | null;
  starting: boolean;
  showQrSection: boolean;
  onStartWhatsapp: () => void;
  onEnterWithoutConnect: () => void;
}) {
  return (
    <div className="min-w-0 w-full rounded-xl border border-primary/25 bg-white/[0.035] px-4 py-4 shadow-[0_0_48px_-20px_hsl(var(--primary)/0.35)] sm:px-5 sm:py-5">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground sm:text-lg">Conectar WhatsApp</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">Seu primeiro canal de atendimento no CRM</p>
        </div>
      </div>

      {showQrSection ? (
        <div className="mb-3 space-y-3">
          {phaseLabel && phase !== 'conectado' ? (
            <p
              className={cn(
                'flex items-center gap-2 text-xs font-medium animate-in fade-in duration-300',
                phase === 'erro' ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {phase === 'aguardando' || phase === 'conectando' ? (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              ) : null}
              {phaseLabel}
            </p>
          ) : null}
          {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}
          {phase === 'conectado' ? (
            <div className="animate-in fade-in flex flex-col items-center gap-2 py-4 duration-500 fill-mode-both">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <Check className="h-6 w-6" strokeWidth={2.5} />
              </div>
              <p className="text-sm font-medium text-emerald-400/95">WhatsApp conectado</p>
              <p className="text-center text-[11px] text-muted-foreground">Finalizando ativação…</p>
            </div>
          ) : qrCode ? (
            <div className="animate-in fade-in flex w-full flex-col items-center gap-2 duration-300 data-[exiting=true]:animate-out data-[exiting=true]:fade-out">
              <div className="mx-auto max-w-full rounded-xl bg-white p-2.5 shadow-[0_0_60px_-16px_hsl(var(--primary)/0.45)] ring-1 ring-white/20 sm:p-3">
                <img
                  src={qrCode}
                  alt="QR Code WhatsApp"
                  className="mx-auto h-[min(48vw,180px)] w-[min(48vw,180px)] max-w-full object-contain sm:h-[200px] sm:w-[200px]"
                />
              </div>
              <p className="text-center text-[11px] text-muted-foreground">
                Abra o WhatsApp no celular e escaneie o código
              </p>
            </div>
          ) : phase === 'conectando' ? (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Preparando QR Code…
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mb-3 space-y-1.5">
          <Label className="text-xs text-muted-foreground">Nome da conexão</Label>
          <Input
            value={connectionName}
            onChange={(e) => onConnectionNameChange(e.target.value)}
            placeholder="Ex.: WhatsApp Comercial"
            className="h-10 w-full border-white/10 bg-white/[0.03] text-sm"
          />
        </div>
      )}

      {!showQrSection ? <WhyConnectNow className="mb-3.5" /> : null}

      {!showQrSection ? (
        <Button
          type="button"
          className="h-11 w-full text-sm font-semibold shadow-[0_0_32px_-8px_hsl(var(--primary)/0.55)]"
          disabled={starting || !connectionName.trim()}
          onClick={onStartWhatsapp}
        >
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
          Conectar WhatsApp
        </Button>
      ) : null}

      {!showQrSection ? (
        <button
          type="button"
          className="mt-2 w-full py-1.5 text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
          onClick={onEnterWithoutConnect}
        >
          Entrar sem conectar
        </button>
      ) : null}
    </div>
  );
}

function WhyConnectNow({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5', className)}>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Benefícios da conexão
      </p>
      <ul className="grid grid-cols-1 gap-x-2 gap-y-1 min-[520px]:grid-cols-2">
        {CONNECT_BENEFITS.map((item) => (
          <li key={item} className="flex items-start gap-1 text-[10px] leading-tight text-muted-foreground">
            <Check className="mt-px h-2.5 w-2.5 shrink-0 text-primary" strokeWidth={2.5} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
