import { useEffect, useState, type ComponentType } from 'react';
import {
  Briefcase,
  CalendarClock,
  GitBranch,
  Headphones,
  Loader2,
  Megaphone,
  Scale,
  Settings2,
  Tags,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { apiClient } from '@/integrations/api/client';
import { chatKanbanService, type ChatKanbanColumn } from '@/services/chatKanban';
import { getMyTenantUsers } from '@/services/tenantLimits';
import { KANBAN_COLUMN_COLOR_PRESETS } from '@/components/chat-kanban/kanbanColumnPresets';
import {
  EMPTY_KANBAN_COLUMN_UI,
  EMPTY_KANBAN_RULES,
  mergeColumnMetadataFull,
  parseKanbanColumnRules,
  parseKanbanColumnUi,
  type KanbanColumnRules,
  type KanbanColumnUi,
} from '@/utils/kanbanColumnRulesUi';
import { ChatKanbanColumnRulesForm, type TeamOption, type TenantUserOption } from '@/components/chat-kanban/ChatKanbanColumnRulesForm';

function ColorPresetPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {KANBAN_COLUMN_COLOR_PRESETS.map((p) => {
        const selected = (p.value ?? null) === (value ?? null);
        return (
          <button
            key={p.label}
            type="button"
            disabled={disabled}
            title={p.label}
            onClick={() => onChange(p.value)}
            className={cn(
              'h-8 w-8 rounded-full border-2 transition-all shrink-0',
              p.swatch,
              selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-105' : 'opacity-90 hover:opacity-100',
              disabled && 'pointer-events-none opacity-50',
            )}
          />
        );
      })}
    </div>
  );
}

function AccordionSectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <span className="flex items-start gap-2.5 text-left">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium leading-tight">{title}</span>
        {subtitle ? (
          <span className="text-[11px] font-normal text-muted-foreground leading-snug">{subtitle}</span>
        ) : null}
      </span>
    </span>
  );
}

function FuturePlaceholder({ description }: { description: string }) {
  return (
    <div className="rounded-md border border-dashed border-border/60 bg-muted/10 px-3 py-3 space-y-2">
      <p className="text-[11px] text-muted-foreground leading-relaxed">{description}</p>
      <span className="inline-flex text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/75">
        Em breve
      </span>
    </div>
  );
}

const ACCORDION_DEFAULT_OPEN = ['general', 'attendance'] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  column: ChatKanbanColumn | null;
  positionLabel: string;
  onSaved: () => void;
};

export function ChatKanbanColumnSettingsSheet({ open, onOpenChange, column, positionLabel, onSaved }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [ui, setUi] = useState<KanbanColumnUi>({ ...EMPTY_KANBAN_COLUMN_UI });
  const [rules, setRules] = useState<KanbanColumnRules>({ ...EMPTY_KANBAN_RULES });
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [tenantUsers, setTenantUsers] = useState<TenantUserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !column) return;
    setName(column.name);
    setColor(column.color ?? null);
    setUi(parseKanbanColumnUi(column.metadata));
    setRules(parseKanbanColumnRules(column.metadata));
  }, [open, column?.id, column?.updated_at]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setTeamsLoading(true);
      setUsersLoading(true);
      try {
        const [teamsRes, users] = await Promise.all([
          apiClient.get<Array<{ id: string; name: string }>>('/api/teams'),
          getMyTenantUsers().catch(() => []),
        ]);
        if (cancelled) return;
        const td = teamsRes.data as unknown;
        if (!teamsRes.error && Array.isArray(td)) {
          setTeams(td.map((t) => ({ id: t.id, name: t.name })));
        } else {
          setTeams([]);
        }
        setTenantUsers(
          users.map((u) => ({
            id: u.id,
            label: u.full_name?.trim() || u.email || u.id,
          })),
        );
      } catch {
        if (!cancelled) {
          setTeams([]);
          setTenantUsers([]);
        }
      } finally {
        if (!cancelled) {
          setTeamsLoading(false);
          setUsersLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleSave = async () => {
    if (!column) return;
    const n = name.trim();
    if (!n) {
      toast.error('Nome obrigatório');
      return;
    }
    setSaving(true);
    try {
      const baseMeta =
        column.metadata && typeof column.metadata === 'object' ? (column.metadata as Record<string, unknown>) : {};
      const meta = mergeColumnMetadataFull(baseMeta, ui, rules);
      await chatKanbanService.patchColumn(column.id, { name: n, color, metadata: meta });
      toast.success('Coluna atualizada');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao guardar');
    } finally {
      setSaving(false);
    }
  };

  const itemClass =
    'border border-border/50 rounded-lg bg-card/40 overflow-hidden mb-2 last:mb-0 shadow-sm shadow-black/[0.02]';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 pt-6 pb-2 space-y-1 shrink-0 text-left">
          <SheetTitle>Coluna</SheetTitle>
          <SheetDescription>
            Configuração contextual. As automações aplicam-se no servidor ao mover um cartão para esta coluna.
          </SheetDescription>
        </SheetHeader>

        {!column ? null : (
          <>
            <ScrollArea className="flex-1 min-h-0 px-6 [&_[data-radix-scroll-area-viewport]]:!block">
              <div className="pb-6 pr-2 pt-1">
                <Accordion
                  type="multiple"
                  defaultValue={[...ACCORDION_DEFAULT_OPEN]}
                  className="w-full"
                >
                  <AccordionItem value="general" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-3 text-sm hover:no-underline',
                        'hover:bg-muted/30 rounded-t-lg [&[data-state=open]]:bg-muted/20',
                      )}
                    >
                      <AccordionSectionHeader
                        icon={Settings2}
                        title="Geral"
                        subtitle="Nome, cor, terminal, visibilidade no quadro"
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0 border-t border-border/40">
                      <div className="space-y-3 pt-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="col-set-name">Nome</Label>
                          <Input
                            id="col-set-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={saving}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-xs text-muted-foreground">Cor do cabeçalho</span>
                          <ColorPresetPicker value={color} onChange={setColor} disabled={saving} />
                        </div>
                        <p className="text-[11px] text-muted-foreground">{positionLabel}</p>
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor="col-terminal" className="text-sm font-normal cursor-pointer">
                            Coluna terminal
                          </Label>
                          <Switch
                            id="col-terminal"
                            checked={rules.is_terminal}
                            onCheckedChange={(v) => setRules((r) => ({ ...r, is_terminal: v }))}
                            disabled={saving}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <Label htmlFor="col-hidden" className="text-sm font-normal cursor-pointer">
                              Ocultar no quadro
                            </Label>
                            <p className="text-[10px] text-muted-foreground leading-snug">
                              A coluna deixa de aparecer no Kanban; os cartões mantêm-se associados.
                            </p>
                          </div>
                          <Switch
                            id="col-hidden"
                            checked={ui.hidden}
                            onCheckedChange={(v) => setUi((u) => ({ ...u, hidden: v }))}
                            disabled={saving}
                          />
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="attendance" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-3 text-sm hover:no-underline',
                        'hover:bg-muted/30 rounded-t-lg [&[data-state=open]]:bg-muted/20',
                      )}
                    >
                      <AccordionSectionHeader
                        icon={Headphones}
                        title="Atendimento"
                        subtitle="Encerrar, fila, atribuições, confirmação e motivo"
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0 border-t border-border/40">
                      <div className="pt-3">
                        <ChatKanbanColumnRulesForm
                          variant="attendance"
                          rules={rules}
                          onChange={setRules}
                          teams={teams}
                          teamsLoading={teamsLoading}
                          tenantUsers={tenantUsers}
                          usersLoading={usersLoading}
                          disabled={saving}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="organization" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-3 text-sm hover:no-underline',
                        'hover:bg-muted/30 rounded-t-lg [&[data-state=open]]:bg-muted/20',
                      )}
                    >
                      <AccordionSectionHeader
                        icon={Tags}
                        title="Organização"
                        subtitle="Etiquetas e prioridade na conversa"
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0 border-t border-border/40">
                      <div className="pt-3">
                        <ChatKanbanColumnRulesForm
                          variant="organization"
                          rules={rules}
                          onChange={setRules}
                          teams={teams}
                          teamsLoading={teamsLoading}
                          tenantUsers={tenantUsers}
                          usersLoading={usersLoading}
                          disabled={saving}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="commercial" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-3 text-sm hover:no-underline',
                        'hover:bg-muted/30 rounded-t-lg [&[data-state=open]]:bg-muted/20',
                      )}
                    >
                      <AccordionSectionHeader
                        icon={Briefcase}
                        title="Comercial"
                        subtitle="Leads, oportunidades e CRM"
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0 border-t border-border/40">
                      <div className="pt-3">
                        <FuturePlaceholder description="Automatizar ligação a leads, oportunidades, estágios de funil e resultados comerciais — sem alterar o funil atual automaticamente até esta fase estar disponível." />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="productivity" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-3 text-sm hover:no-underline',
                        'hover:bg-muted/30 rounded-t-lg [&[data-state=open]]:bg-muted/20',
                      )}
                    >
                      <AccordionSectionHeader
                        icon={CalendarClock}
                        title="Produtividade"
                        subtitle="Tarefas, lembretes e follow-up"
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0 border-t border-border/40">
                      <div className="pt-3">
                        <FuturePlaceholder description="Criar tarefas internas, lembretes e cadências de acompanhamento quando o cartão entrar nesta coluna." />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="communication" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-3 text-sm hover:no-underline',
                        'hover:bg-muted/30 rounded-t-lg [&[data-state=open]]:bg-muted/20',
                      )}
                    >
                      <AccordionSectionHeader
                        icon={Megaphone}
                        title="Comunicação"
                        subtitle="Notificações e mensagens"
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0 border-t border-border/40">
                      <div className="pt-3">
                        <FuturePlaceholder description="Notificar equipa, operadores ou supervisores; modelos de mensagem e integrações de envio." />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="sla" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-3 text-sm hover:no-underline',
                        'hover:bg-muted/30 rounded-t-lg [&[data-state=open]]:bg-muted/20',
                      )}
                    >
                      <AccordionSectionHeader
                        icon={Scale}
                        title="SLA e validações avançadas"
                        subtitle="Tempos, bloqueios e regras condicionais"
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0 border-t border-border/40">
                      <div className="pt-3">
                        <FuturePlaceholder description="SLA por etapa, validação de campos obrigatórios, impedir retrocesso e alertas de cartão parado." />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="funnel" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-3 text-sm hover:no-underline',
                        'hover:bg-muted/30 rounded-t-lg [&[data-state=open]]:bg-muted/20',
                      )}
                    >
                      <AccordionSectionHeader
                        icon={GitBranch}
                        title="Integração com funil"
                        subtitle="Funil de vendas existente (opcional)"
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0 border-t border-border/40">
                      <div className="pt-3">
                        <FuturePlaceholder description="Mapear esta coluna a estágios do funil CRM, com sincronização opcional e controlada — política atual do Kanban mantém-se sem alterar o funil automaticamente." />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </ScrollArea>

            <SheetFooter className="px-6 py-4 border-t border-border/60 shrink-0 gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
