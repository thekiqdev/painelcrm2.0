import React from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  UserPlus,
  FileText,
  ListTodo,
  Trash2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { resolveProfileAvatarUrl } from '@/utils/chatIdentityDisplay';
import { formatDateOnlyPtBr } from '@/utils/formatCalendarDate';
import { chatOpenQueryWithReturn } from '@/lib/chatListNavigation';

export type LeadRow = Record<string, unknown> & {
  id: string;
  name?: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status?: string | null;
  whatsapp_avatar_url?: string | null;
  updated_at?: string | null;
};

type Props = {
  leads: LeadRow[];
  getStatusVariant: (status: string) => { color: string };
  onView: (lead: LeadRow) => void;
  onEdit: (lead: LeadRow) => void;
  onTasks: (lead: LeadRow) => void;
  onConvert: (lead: LeadRow) => void;
  onProposal: (lead: LeadRow) => void;
  onDelete?: (lead: LeadRow) => void;
  canProposal?: boolean;
};

function formatUpdated(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return formatDateOnlyPtBr(iso.slice(0, 10));
  } catch {
    return null;
  }
}

const LeadMobileCardList: React.FC<Props> = ({
  leads,
  getStatusVariant,
  onView,
  onEdit,
  onTasks,
  onConvert,
  onProposal,
  onDelete,
  canProposal = true,
}) => {
  if (leads.length === 0) {
    return (
      <div className="flex min-h-[9rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/80 bg-muted/15 px-3 py-8 text-center md:hidden">
        <p className="text-sm font-medium text-foreground">Nenhum lead encontrado</p>
        <p className="text-xs text-muted-foreground">Ajuste filtros ou o termo de busca.</p>
      </div>
    );
  }

  return (
    <ul className="m-0 list-none space-y-2 p-0 md:hidden">
      {leads.map((lead) => {
        const avatar = resolveProfileAvatarUrl(lead, lead.whatsapp_avatar_url ?? null);
        const st = String(lead.status ?? '');
        const variant = getStatusVariant(st);
        const updatedLabel = formatUpdated(lead.updated_at as string | undefined);
        const metaParts = [
          lead.source ? `Origem: ${lead.source}` : null,
          updatedLabel ? `Atual. ${updatedLabel}` : null,
        ].filter(Boolean);
        const isConverted = st.toLowerCase() === 'convertido';

        return (
          <li key={lead.id}>
            <Card className="overflow-hidden border-border/70 shadow-sm">
              <CardContent className="p-0">
                <button
                  type="button"
                  className="flex w-full min-h-[4.25rem] gap-2.5 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/20 focus-visible:bg-muted/25 active:bg-muted/35"
                  onClick={() => onView(lead)}
                  aria-label={`Abrir lead ${lead.name ?? ''}`}
                >
                  <Avatar className="h-10 w-10 shrink-0 ring-1 ring-border/50">
                    {avatar.src ? <AvatarImage src={avatar.src} alt={lead.name ?? ''} /> : null}
                    <AvatarFallback className="text-xs">{avatar.initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold leading-tight text-foreground">{lead.name}</p>
                        {lead.company ? (
                          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                            {lead.company}
                          </p>
                        ) : null}
                      </div>
                      <Badge
                        variant="outline"
                        className="max-w-[7rem] shrink-0 truncate border-0 px-2 py-0.5 text-[11px] text-white"
                        style={{ backgroundColor: variant.color }}
                      >
                        {st || '—'}
                      </Badge>
                    </div>
                    {lead.phone ? (
                      <p className="mt-1 flex items-center gap-1 truncate text-xs tabular-nums text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                        {lead.phone}
                      </p>
                    ) : null}
                    {lead.email ? (
                      <p className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                        <span className="truncate">{lead.email}</span>
                      </p>
                    ) : null}
                    {metaParts.length > 0 ? (
                      <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{metaParts.join(' · ')}</p>
                    ) : null}
                  </div>
                </button>

                <div className="flex items-center gap-1.5 border-t border-border/50 bg-muted/15 px-2 py-1.5">
                  {!isConverted ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 min-w-0 flex-1 touch-manipulation px-2 text-xs font-medium"
                      onClick={(e) => {
                        e.stopPropagation();
                        onConvert(lead);
                      }}
                    >
                      <UserPlus className="mr-1 h-3.5 w-3.5 shrink-0" aria-hidden />
                      Converter
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 min-w-0 flex-1 touch-manipulation px-2 text-xs"
                    asChild
                  >
                    <Link
                      to={`/chat${chatOpenQueryWithReturn({ openLeadId: lead.id })}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MessageCircle className="mr-1 h-3.5 w-3.5 shrink-0" aria-hidden />
                      Chat
                    </Link>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0 touch-manipulation"
                        aria-label="Mais ações"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuLabel>Ações rápidas</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {canProposal ? (
                        <DropdownMenuItem
                          onClick={() => {
                            onProposal(lead);
                          }}
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          Criar proposta
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem
                        onClick={() => {
                          onEdit(lead);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          onTasks(lead);
                        }}
                      >
                        <ListTodo className="mr-2 h-4 w-4" />
                        Tarefas
                      </DropdownMenuItem>
                      {onDelete ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => onDelete(lead)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir lead
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
};

export default LeadMobileCardList;
