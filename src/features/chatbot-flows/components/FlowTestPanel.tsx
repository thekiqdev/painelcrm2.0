import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Clock, Play, RotateCcw, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { FlowSimulationState } from '../lib/flowSimulator';
import type { FlowTestSubject } from '../lib/flowTestSubject';
import { FlowTestSubjectPicker } from './FlowTestSubjectPicker';

type Props = {
  open: boolean;
  onClose: () => void;
  sim: FlowSimulationState | null;
  subject: FlowTestSubject;
  onSubjectChange: (subject: FlowTestSubject) => void;
  onStart: () => void;
  onReset: () => void;
  onReply: (text: string, interactiveReplyId?: string) => void;
  onHttpResolve: (ok: boolean) => void;
  onTimeoutResolve?: () => void;
  canSimulateTimeout?: boolean;
  resolvingInvoice?: boolean;
  resolvingHttp?: boolean;
};

export function FlowTestPanel({
  open,
  onClose,
  sim,
  subject,
  onSubjectChange,
  onStart,
  onReset,
  onReply,
  onHttpResolve,
  onTimeoutResolve,
  canSimulateTimeout,
  resolvingInvoice,
  resolvingHttp,
}: Props) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sim?.messages.length, sim?.log.length]);

  if (!open) return null;

  const waitingInput = sim?.session.status === 'waiting_input';
  const waitingHttp = sim?.pendingHttp || sim?.session.status === 'waiting_http';
  const menuOptions = sim?.pendingMenuOptions || null;
  const finished =
    sim &&
    (sim.session.status === 'ended' ||
      sim.session.status === 'transferred' ||
      sim.session.status === 'error');
  const idle = !sim || (!sim.running && sim.messages.length === 0);
  const startBlocked =
    (subject.kind === 'client' || subject.kind === 'lead') && !subject.id;

  return (
    <div className="pointer-events-auto absolute bottom-[7.5rem] left-3 z-20 flex w-[min(100%-1.5rem,22rem)] flex-col overflow-hidden rounded-xl border bg-background/95 shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div>
          <p className="text-sm font-medium">Testar fluxo</p>
          <p className="text-[11px] text-muted-foreground">Simulação do rascunho (HTTP real)</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Reiniciar"
            onClick={onReset}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {idle ? (
        <div className="space-y-3 p-4">
          <FlowTestSubjectPicker value={subject} onChange={onSubjectChange} />
          <p className="text-sm text-muted-foreground">
            Percorra o fluxo como um lead: mensagens, condições e ações CRM (sem alterar dados reais).
          </p>
          <Button className="w-full" onClick={onStart} disabled={startBlocked}>
            <Play className="mr-1.5 h-4 w-4" />
            Iniciar simulação
          </Button>
          {startBlocked ? (
            <p className="text-[11px] text-amber-700">Selecione um {subject.kind === 'client' ? 'cliente' : 'lead'} ou use Mock.</p>
          ) : null}
        </div>
      ) : (
        <>
          {sim?.testSubject?.kind !== 'none' && sim?.testSubject?.id ? (
            <div className="border-b bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
              Testando como{' '}
              <span className="font-medium text-foreground">
                {sim.testSubject.kind === 'client' ? 'cliente' : 'lead'} {sim.testSubject.label}
              </span>
            </div>
          ) : null}
          <div className="max-h-40 space-y-1.5 overflow-auto border-b bg-muted/30 px-3 py-2">
            {sim!.log.map((entry) => (
              <div key={entry.id} className="flex items-start gap-1.5 text-[11px]">
                {entry.status === 'error' ? (
                  <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-rose-600" />
                ) : entry.status === 'wait' ? (
                  <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                )}
                <div className="min-w-0">
                  <span className="font-medium">{entry.label}</span>
                  <span className="text-muted-foreground"> — {entry.detail.slice(0, 80)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="max-h-52 space-y-2 overflow-auto px-3 py-2">
            {sim!.messages.map((m) => (
              <div key={m.id} className="space-y-1.5">
                <div
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-sm',
                    m.role === 'bot' && 'bg-sky-50 text-sky-950 dark:bg-sky-950/40 dark:text-sky-50',
                    m.role === 'user' && 'ml-6 bg-muted',
                    m.role === 'system' && 'text-[11px] text-muted-foreground'
                  )}
                >
                  {m.text}
                </div>
                {m.menuOptions && m.menuOptions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pl-0.5">
                    {m.menuOptions.map((opt) => (
                      <span
                        key={opt.id}
                        className="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100"
                      >
                        {opt.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {resolvingInvoice ? (
            <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
              Carregando faturas do cliente…
            </div>
          ) : resolvingHttp ? (
            <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
              Chamando HTTP/webhook real…
            </div>
          ) : waitingHttp ? (
            <div className="flex gap-2 border-t px-3 py-2">
              {sim?.pendingHttpKind === 'invoice' ? (
                <>
                  <Button className="flex-1" size="sm" onClick={() => onHttpResolve(true)}>
                    {sim.testSubject.clientId ? 'Usar faturas do cliente' : 'Achou fatura'}
                  </Button>
                  <Button
                    className="flex-1"
                    size="sm"
                    variant="destructive"
                    onClick={() => onHttpResolve(false)}
                  >
                    Nenhuma
                  </Button>
                </>
              ) : sim?.pendingHttpKind === 'crm' ? (
                <>
                  <Button className="flex-1" size="sm" onClick={() => onHttpResolve(true)}>
                    {sim.testSubject.kind === 'client'
                      ? 'Classificar (cliente)'
                      : sim.testSubject.kind === 'lead'
                        ? 'Classificar (lead)'
                        : 'Classificar (sem vínculo)'}
                  </Button>
                  <Button
                    className="flex-1"
                    size="sm"
                    variant="outline"
                    onClick={() => onHttpResolve(false)}
                  >
                    Forçar sem vínculo
                  </Button>
                </>
              ) : sim?.pendingHttpKind === 'crm_convert' ? (
                <>
                  <Button className="flex-1" size="sm" onClick={() => onHttpResolve(true)}>
                    Continuar (lead fictício)
                  </Button>
                  <Button
                    className="flex-1"
                    size="sm"
                    variant="destructive"
                    onClick={() => onHttpResolve(false)}
                  >
                    Forçar erro
                  </Button>
                </>
              ) : sim?.pendingHttpKind === 'ticket' ? (
                <>
                  <Button className="flex-1" size="sm" onClick={() => onHttpResolve(true)}>
                    {String(sim.session.variables['ticket._assist_phase'] || '') === 'create'
                      ? 'Criar ticket (mock)'
                      : String(sim.session.variables['ticket._assist_phase'] || '') === 'bootstrap'
                        ? 'Usar categorias do tenant'
                        : sim.testSubject.clientId
                          ? 'Usar chamados do cliente'
                          : 'Achou chamado'}
                  </Button>
                  <Button
                    className="flex-1"
                    size="sm"
                    variant="destructive"
                    onClick={() => onHttpResolve(false)}
                  >
                    {String(sim.session.variables['ticket._assist_phase'] || '') === 'bootstrap'
                      ? 'Sem cliente / vazio'
                      : 'Nenhum'}
                  </Button>
                </>
              ) : (
                <div className="w-full text-[11px] text-muted-foreground">
                  Aguardando resposta HTTP…
                </div>
              )}
            </div>
          ) : waitingInput ? (
            <div className="space-y-2 border-t px-3 py-2">
              {menuOptions && menuOptions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {menuOptions.map((opt) => (
                    <Button
                      key={opt.id}
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7"
                      onClick={() => onReply(opt.label, opt.id)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              ) : null}
              <form
                className="flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = draft.trim();
                  if (!t) return;
                  onReply(t);
                  setDraft('');
                }}
              >
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    menuOptions?.length
                      ? 'Ou digite o número / id…'
                      : 'Resposta do contato…'
                  }
                  className="h-8"
                />
                <Button type="submit" size="icon" className="h-8 w-8 shrink-0">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </form>
              {canSimulateTimeout && onTimeoutResolve ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 w-full border-amber-300 text-amber-800"
                  onClick={onTimeoutResolve}
                >
                  <Clock className="mr-1.5 h-3.5 w-3.5" />
                  Simular timeout
                </Button>
              ) : null}
            </div>
          ) : finished ? (
            <div className="flex gap-2 border-t px-3 py-2">
              <Button className="flex-1" size="sm" variant="outline" onClick={onStart}>
                <Play className="mr-1 h-3.5 w-3.5" />
                Testar de novo
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
