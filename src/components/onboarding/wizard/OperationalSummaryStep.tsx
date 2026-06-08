import { Button } from '@/components/ui/button';
import { ActivationReadyHints } from './ActivationReadyHints';
import { Check, MessageCircle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export type OperationalSummary = {
  company_name: string;
  logo_light_url: string | null;
  logo_dark_url: string | null;
  members: Array<{ full_name: string; email: string; role: string; phone?: string | null }>;
  whatsapp: {
    connected: boolean;
    connection_name?: string | null;
    phone?: string | null;
    profile_name?: string | null;
    skipped?: boolean;
  };
  plan_name: string | null;
  activation_progress: number;
  operational_status: string;
};

type Props = {
  summary: OperationalSummary;
  loading?: boolean;
  onEnterDashboard: () => void;
};

function Row({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <li className="flex gap-3 border-b border-white/[0.06] py-3 last:border-0">
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-muted-foreground',
        )}
      >
        {ok ? <Check className="h-3 w-3" strokeWidth={3} /> : '—'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {detail ? <p className="text-xs text-muted-foreground truncate">{detail}</p> : null}
      </div>
    </li>
  );
}

export function OperationalSummaryStep({ summary, loading, onEnterDashboard }: Props) {
  const logo = summary.logo_light_url ?? summary.logo_dark_url;
  const waOk = summary.whatsapp.connected && !summary.whatsapp.skipped;

  return (
    <div className="animate-in fade-in zoom-in-95 duration-500">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 shadow-[0_0_48px_-12px_rgba(52,211,153,0.45)]">
          <Check className="h-8 w-8 text-emerald-400" strokeWidth={2.5} />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Sua operação está pronta
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Workspace operacional ativo · {summary.activation_progress}% da ativação
        </p>
      </div>

      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
        {logo ? (
          <img src={logo} alt="" className="h-14 w-14 rounded-xl object-cover ring-1 ring-white/10" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
            {summary.company_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{summary.company_name}</p>
          {summary.plan_name ? (
            <p className="text-xs text-muted-foreground">Plano {summary.plan_name}</p>
          ) : null}
          <p className="mt-1 text-[10px] uppercase tracking-wider text-primary/80">
            {summary.operational_status === 'operacional_ativo' ? 'Operação ativa' : 'Ativação parcial'}
          </p>
        </div>
      </div>

      <ul className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4">
        <Row ok label="Empresa configurada" detail={summary.company_name} />
        <Row
          ok={summary.members.length > 0}
          label="Equipe inicial"
          detail={
            summary.members.length > 0
              ? `${summary.members.length} membro(s)`
              : 'Você pode convidar depois'
          }
        />
        <Row
          ok={waOk}
          label="WhatsApp"
          detail={
            waOk
              ? `${summary.whatsapp.connection_name ?? 'Canal'} · ${summary.whatsapp.phone ?? summary.whatsapp.profile_name ?? 'conectado'}`
              : summary.whatsapp.skipped
                ? 'Conectar depois nas configurações'
                : 'Pendente'
          }
        />
        <Row ok label="Workspace operacional" detail="Foundation pronta para uso" />
      </ul>

      {summary.members.length > 0 ? (
        <div className="mt-4 space-y-2">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Equipe
          </p>
          {summary.members.slice(0, 4).map((m) => (
            <div
              key={m.email}
              className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2 text-sm"
            >
              <span className="truncate font-medium">{m.full_name}</span>
              <span className="text-xs text-muted-foreground">{m.role}</span>
            </div>
          ))}
        </div>
      ) : null}

      {waOk ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-3">
          <MessageCircle className="h-5 w-5 text-emerald-400" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">{summary.whatsapp.connection_name}</p>
            <p className="text-xs text-muted-foreground">
              {summary.whatsapp.profile_name ?? summary.whatsapp.phone ?? 'Online'}
            </p>
          </div>
          <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
        </div>
      ) : null}

      <ActivationReadyHints />

      <Button
        className="mt-8 h-12 w-full text-base shadow-[0_0_32px_-8px_hsl(var(--primary)/0.5)]"
        onClick={onEnterDashboard}
        disabled={loading}
      >
        Acessar dashboard
      </Button>
    </div>
  );
}
