import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { clientsService, type Client } from '@/services/clients';
import { searchLeadsForPicker, type LeadPickerRow } from '@/services/leadsPicker';
import {
  EMPTY_TEST_SUBJECT,
  type FlowTestSubject,
  type FlowTestSubjectKind,
} from '../lib/flowTestSubject';

type Props = {
  value: FlowTestSubject;
  onChange: (subject: FlowTestSubject) => void;
  disabled?: boolean;
};

function clientToSubject(c: Client): FlowTestSubject {
  return {
    kind: 'client',
    id: c.id,
    clientId: c.id,
    label: c.name || c.company || c.id,
    name: c.name || c.company || '',
    phone: c.whatsapp || c.phone || '',
    email: c.email || '',
  };
}

function leadToSubject(l: LeadPickerRow): FlowTestSubject {
  return {
    kind: 'lead',
    id: l.id,
    clientId: null,
    label: l.name || l.company || l.id,
    name: l.name || l.company || '',
    phone: l.phone || '',
    email: l.email || '',
  };
}

export function FlowTestSubjectPicker({ value, onChange, disabled }: Props) {
  const [kind, setKind] = useState<FlowTestSubjectKind>(value.kind);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [clientHits, setClientHits] = useState<Client[]>([]);
  const [leadHits, setLeadHits] = useState<LeadPickerRow[]>([]);

  useEffect(() => {
    setKind(value.kind);
  }, [value.kind]);

  useEffect(() => {
    if (kind === 'none') {
      setClientHits([]);
      setLeadHits([]);
      return;
    }
    const term = q.trim();
    if (term.length < 2) {
      setClientHits([]);
      setLeadHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          if (kind === 'client') {
            const rows = await clientsService.getClients({ q: term });
            if (!cancelled) setClientHits(rows.slice(0, 12));
          } else {
            const rows = await searchLeadsForPicker(term);
            if (!cancelled) setLeadHits(rows.slice(0, 12));
          }
        } catch {
          if (!cancelled) {
            setClientHits([]);
            setLeadHits([]);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [kind, q]);

  const setKindAndClear = (next: FlowTestSubjectKind) => {
    setKind(next);
    setQ('');
    setClientHits([]);
    setLeadHits([]);
    if (next === 'none') onChange(EMPTY_TEST_SUBJECT);
    else if (value.kind !== next) {
      onChange({
        ...EMPTY_TEST_SUBJECT,
        kind: next,
        label: next === 'client' ? 'Selecione um cliente' : 'Selecione um lead',
      });
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">Contexto do teste</Label>
      <div className="flex gap-1 rounded-md border p-0.5">
        {(
          [
            ['none', 'Mock'],
            ['client', 'Cliente'],
            ['lead', 'Lead'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            disabled={disabled}
            className={cn(
              'flex-1 rounded px-2 py-1 text-xs font-medium transition-colors',
              kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            )}
            onClick={() => setKindAndClear(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {kind !== 'none' ? (
        <div className="space-y-1.5">
          <Input
            value={q}
            disabled={disabled}
            placeholder={kind === 'client' ? 'Buscar cliente…' : 'Buscar lead…'}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 text-sm"
          />
          {value.id ? (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs">
              <span className="truncate font-medium">{value.label}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                disabled={disabled}
                onClick={() => {
                  setQ('');
                  onChange({
                    ...EMPTY_TEST_SUBJECT,
                    kind,
                    label: kind === 'client' ? 'Selecione um cliente' : 'Selecione um lead',
                  });
                }}
              >
                Trocar
              </Button>
            </div>
          ) : null}
          {loading ? (
            <p className="text-[11px] text-muted-foreground">Buscando…</p>
          ) : null}
          {!value.id && kind === 'client' && clientHits.length > 0 ? (
            <ul className="max-h-28 overflow-auto rounded-md border text-xs">
              {clientHits.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start px-2 py-1.5 text-left hover:bg-muted"
                    onClick={() => {
                      onChange(clientToSubject(c));
                      setQ('');
                      setClientHits([]);
                    }}
                  >
                    <span className="font-medium">{c.name || c.company || c.id}</span>
                    <span className="text-muted-foreground">
                      {[c.phone || c.whatsapp, c.email].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {!value.id && kind === 'lead' && leadHits.length > 0 ? (
            <ul className="max-h-28 overflow-auto rounded-md border text-xs">
              {leadHits.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start px-2 py-1.5 text-left hover:bg-muted"
                    onClick={() => {
                      onChange(leadToSubject(l));
                      setQ('');
                      setLeadHits([]);
                    }}
                  >
                    <span className="font-medium">{l.name || l.company || l.id}</span>
                    <span className="text-muted-foreground">
                      {[l.phone, l.email].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {kind === 'client' ? (
            <p className="text-[11px] text-muted-foreground">
              Com cliente, o nó Faturas busca cobranças reais em aberto.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Lead preenche nome/telefone; faturas seguem mock (sem client_id).
            </p>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Sem seleção: variáveis e faturas usam dados de exemplo.
        </p>
      )}
    </div>
  );
}
