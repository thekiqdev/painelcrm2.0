import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { KanbanColumnRules } from '@/utils/kanbanColumnRulesUi';

export type TeamOption = { id: string; name: string };
export type TenantUserOption = { id: string; label: string };

type Props = {
  rules: KanbanColumnRules;
  onChange: (r: KanbanColumnRules) => void;
  teams: TeamOption[];
  teamsLoading: boolean;
  tenantUsers: TenantUserOption[];
  usersLoading: boolean;
  disabled?: boolean;
  /** `all` = blocos empilhados (legado). `attendance` / `organization` = um bloco para usar dentro de acordeões. */
  variant?: 'all' | 'attendance' | 'organization';
};

export function ChatKanbanColumnRulesForm({
  rules,
  onChange,
  teams,
  teamsLoading,
  tenantUsers,
  usersLoading,
  disabled,
  variant = 'all',
}: Props) {
  const set = (partial: Partial<KanbanColumnRules>) => onChange({ ...rules, ...partial });

  const blocksAssignTargets =
    rules.close_conversation || rules.clear_assignee || rules.send_to_queue;

  const clearAssignsIfNeeded = (partial: Partial<KanbanColumnRules>) => {
    const next = { ...rules, ...partial };
    const willBlock =
      next.close_conversation || next.clear_assignee || next.send_to_queue;
    if (willBlock) {
      next.assign_team_id = null;
      next.assign_user_id = null;
    }
    onChange(next);
  };

  const attendanceSection = (
    <div className="rounded-md border border-border/40 bg-muted/10 p-2 space-y-2.5 text-sm">
      {variant === 'all' ? (
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Atendimento</p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="kr-close" className="text-xs font-normal leading-tight cursor-pointer">
          Encerrar conversa
        </Label>
        <Switch
          id="kr-close"
          checked={rules.close_conversation}
          onCheckedChange={(v) => clearAssignsIfNeeded({ close_conversation: v })}
          disabled={disabled}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="kr-clear" className="text-xs font-normal leading-tight cursor-pointer">
          Limpar responsável
        </Label>
        <Switch
          id="kr-clear"
          checked={rules.clear_assignee}
          onCheckedChange={(v) => clearAssignsIfNeeded({ clear_assignee: v })}
          disabled={disabled}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="kr-queue" className="text-xs font-normal leading-tight cursor-pointer">
          Enviar para fila geral
        </Label>
        <Switch
          id="kr-queue"
          checked={rules.send_to_queue}
          onCheckedChange={(v) => clearAssignsIfNeeded({ send_to_queue: v })}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2 rounded-md border border-border/35 bg-background/30 p-2">
        <p className="text-[10px] font-medium text-muted-foreground">Atribuições</p>
        {blocksAssignTargets ? (
          <p className="text-[9px] text-muted-foreground leading-tight" title="Desative encerrar, limpar responsável ou fila para atribuir.">
            Indisponível com encerrar / fila / limpar responsável.
          </p>
        ) : null}
        <div className="space-y-1.5">
          <Label className="text-xs">Atribuir à equipe</Label>
          <Select
            value={rules.assign_team_id ?? 'none'}
            onValueChange={(v) => set({ assign_team_id: v === 'none' ? null : v })}
            disabled={disabled || teamsLoading || blocksAssignTargets}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder={teamsLoading ? 'A carregar…' : 'Nenhuma'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhuma</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Atribuir ao operador</Label>
          <Select
            value={rules.assign_user_id ?? 'none'}
            onValueChange={(v) => set({ assign_user_id: v === 'none' ? null : v })}
            disabled={disabled || usersLoading || blocksAssignTargets}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder={usersLoading ? 'A carregar…' : 'Nenhum'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {tenantUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="kr-reason" className="text-xs font-normal leading-tight cursor-pointer">
          Exigir motivo ao mover
        </Label>
        <Switch
          id="kr-reason"
          checked={rules.require_move_reason}
          onCheckedChange={(v) => set({ require_move_reason: v })}
          disabled={disabled}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="kr-confirm" className="text-xs font-normal leading-tight cursor-pointer">
          Exigir confirmação ao mover
        </Label>
        <Switch
          id="kr-confirm"
          checked={rules.require_confirmation}
          onCheckedChange={(v) => set({ require_confirmation: v })}
          disabled={disabled}
        />
      </div>
    </div>
  );

  const organizationSection = (
    <div className="rounded-md border border-border/40 bg-muted/10 p-2 space-y-2.5 text-sm">
      {variant === 'all' ? (
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Organização</p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="kr-add-tag" className="text-xs">
          Aplicar etiqueta
        </Label>
        <Input
          id="kr-add-tag"
          className="h-9 text-xs"
          value={rules.add_tag_label}
          onChange={(e) => set({ add_tag_label: e.target.value.slice(0, 64) })}
          placeholder="Ex.: vip, retorno…"
          disabled={disabled}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="kr-rem-tag" className="text-xs">
          Remover etiqueta
        </Label>
        <Input
          id="kr-rem-tag"
          className="h-9 text-xs"
          value={rules.remove_tag_label}
          onChange={(e) => set({ remove_tag_label: e.target.value.slice(0, 64) })}
          placeholder="Nome da etiqueta a remover"
          disabled={disabled}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Definir prioridade da conversa</Label>
        <Select
          value={
            rules.conversation_priority === 'low' ||
            rules.conversation_priority === 'medium' ||
            rules.conversation_priority === 'high'
              ? rules.conversation_priority
              : 'none'
          }
          onValueChange={(v) =>
            set({
              conversation_priority: v === 'none' ? '' : (v as KanbanColumnRules['conversation_priority']),
            })
          }
          disabled={disabled}
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Não alterar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Não alterar</SelectItem>
            <SelectItem value="low">Baixa</SelectItem>
            <SelectItem value="medium">Média</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  if (variant === 'attendance') {
    return <div className="space-y-0">{attendanceSection}</div>;
  }
  if (variant === 'organization') {
    return <div className="space-y-0">{organizationSection}</div>;
  }

  return (
    <div className="space-y-4">
      {attendanceSection}
      {organizationSection}
    </div>
  );
}
