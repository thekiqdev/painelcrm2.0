import { Plus, Trash2, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FOUNDATION_ROLES } from '../constants';
import { cn } from '@/lib/utils';

export type TeamMemberDraft = {
  email: string;
  full_name: string;
  role: string;
};

type Props = {
  members: TeamMemberDraft[];
  seatsLimit: number;
  onChange: (members: TeamMemberDraft[]) => void;
  canAddMember: boolean;
};

function memberInitials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return `${p[0][0]}${p[1][0]}`.toUpperCase();
  return (p[0]?.[0] ?? '?').toUpperCase();
}

function roleLabel(role: string): string {
  return FOUNDATION_ROLES.find((r) => r.value === role)?.label ?? role;
}

export function TeamMembersLivePreview({ members }: { members: TeamMemberDraft[] }) {
  const filled = members.filter((m) => m.full_name.trim() || m.email.trim());

  if (filled.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-center text-xs text-muted-foreground">
        Membros adicionados aparecerão aqui em tempo real.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {filled.map((m, i) => (
        <li
          key={i}
          className="flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-2"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
            {m.full_name.trim() ? memberInitials(m.full_name) : <User className="h-3.5 w-3.5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {m.full_name.trim() || 'Novo membro'}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {roleLabel(m.role)}
              {m.email.trim() ? ` · ${m.email.trim()}` : ''}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TeamSeatCounter({ used, limit }: { used: number; limit: number }) {
  return (
    <p className="text-center text-xs tabular-nums text-muted-foreground lg:text-left">
      <span className="font-medium text-foreground">{used}</span>
      <span className="text-muted-foreground"> / </span>
      <span className="font-medium text-foreground">{limit}</span>
      <span className="text-muted-foreground"> usuários utilizados</span>
    </p>
  );
}

export function TeamStepMainForm({ members, seatsLimit, onChange, canAddMember }: Props) {
  const usedSeats = 1 + members.filter((m) => m.full_name.trim() && m.email.trim()).length;

  const addMember = () => {
    if (!canAddMember) return;
    onChange([...members, { email: '', full_name: '', role: 'member' }]);
  };

  const updateMember = (index: number, patch: Partial<TeamMemberDraft>) => {
    const next = [...members];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const removeMember = (index: number) => {
    onChange(members.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground lg:text-[1.75rem]">
          Quem terá acesso ao CRM?
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Convide sua equipe agora ou faça isso depois.
        </p>
      </header>

      <TeamSeatCounter used={usedSeats} limit={seatsLimit} />

      <TeamMembersLivePreview members={members} />

      {members.length === 0 ? (
        <button
          type="button"
          disabled={!canAddMember}
          onClick={addMember}
          className={cn(
            'flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15',
            'text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-white/[0.03]',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <Plus className="h-4 w-4" />
          Adicionar membro
        </button>
      ) : (
        <div className="space-y-3">
          {members.map((m, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">Membro {i + 1}</p>
                <button
                  type="button"
                  onClick={() => removeMember(i)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                  aria-label="Remover membro"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Nome</Label>
                  <Input
                    placeholder="Nome completo"
                    value={m.full_name}
                    className="h-10 border-white/10 bg-transparent text-sm"
                    onChange={(e) => updateMember(i, { full_name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Cargo</Label>
                    <Select value={m.role} onValueChange={(v) => updateMember(i, { role: v })}>
                      <SelectTrigger className="h-10 border-white/10 bg-transparent text-sm">
                        <SelectValue placeholder="Cargo" />
                      </SelectTrigger>
                      <SelectContent>
                        {FOUNDATION_ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Email</Label>
                    <Input
                      placeholder="email@empresa.com"
                      type="email"
                      value={m.email}
                      className="h-10 border-white/10 bg-transparent text-sm"
                      onChange={(e) => updateMember(i, { email: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
          {canAddMember ? (
            <button
              type="button"
              onClick={addMember}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/12 text-sm text-muted-foreground hover:border-primary/25 hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              Adicionar membro
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
