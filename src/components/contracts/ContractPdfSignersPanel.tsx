import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { SignerRole } from '@/types/contracts';
import { formatBrazilTaxIdDisplay, isBrazilTaxIdDigits, normalizeBrazilTaxIdInput } from '@/utils/brazilTaxId';
import {
  formatBrazilWhatsappDisplay,
  isPlausibleBrazilWhatsapp,
  normalizeBrazilWhatsappDigits,
} from '@/utils/brazilWhatsappPhone';
import { PDF_SIGNER_COLOR_PALETTE, pdfSignerColorIndex } from '@/utils/pdfSignerColors';
import {
  CheckCircle2,
  ChevronDown,
  Crosshair,
  HelpCircle,
  Mail,
  MapPin,
  MapPinOff,
  Pencil,
  PenLine,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from '@/components/ui/sonner';

export type PdfSignerDraft = {
  localId: string;
  serverId?: string;
  name: string;
  email: string;
  whatsapp_phone: string;
  tax_id: string;
  role: SignerRole;
  signing_order: number;
  signed_at?: string | null;
  signature_invite_status?: 'none' | 'active' | 'expired' | 'revoked' | 'consumed';
};

type Props = {
  signers: PdfSignerDraft[];
  onChange: (next: PdfSignerDraft[]) => void;
  documentLocked?: boolean;
  placementSignerId: string | null;
  onPlacementSignerIdChange: (id: string | null) => void;
  signaturePlacedBySignerId?: Record<string, boolean>;
  onRemoveSignerSignature?: (signerKey: string) => void;
};

function newLocalId(): string {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function workflowStatus(
  placed: boolean,
  inviteStatus?: PdfSignerDraft['signature_invite_status'],
  signed?: boolean,
): { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; icon: React.ReactNode } {
  if (signed) {
    return { label: 'Assinado', variant: 'default', icon: <CheckCircle2 className="h-3 w-3" /> };
  }
  if (inviteStatus === 'active') {
    return { label: 'Enviado', variant: 'secondary', icon: <Mail className="h-3 w-3" /> };
  }
  if (placed) {
    return { label: 'Posicionada', variant: 'outline', icon: <MapPin className="h-3 w-3" /> };
  }
  return { label: 'Pendente', variant: 'destructive', icon: <MapPinOff className="h-3 w-3" /> };
}

const EMPTY_FORM = {
  name: '',
  email: '',
  whatsapp_phone: '',
  tax_id: '',
  role: 'CLIENT' as SignerRole,
};

export function ContractPdfSignersPanel({
  signers,
  onChange,
  documentLocked = false,
  placementSignerId,
  onPlacementSignerIdChange,
  signaturePlacedBySignerId = {},
  onRemoveSignerSignature,
}: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingLocalId, setEditingLocalId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [formAccordion, setFormAccordion] = useState<string | undefined>(undefined);

  const sortedSigners = useMemo(
    () => [...signers].sort((a, b) => (a.signing_order ?? 0) - (b.signing_order ?? 0)),
    [signers],
  );

  const placedCount = sortedSigners.filter((s) => signaturePlacedBySignerId[s.serverId ?? s.localId]).length;
  const progressPct = signers.length > 0 ? Math.round((placedCount / signers.length) * 100) : 0;

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingLocalId(null);
    setFormAccordion(undefined);
  };

  const validateForm = (): boolean => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Nome e e-mail são obrigatórios.');
      return false;
    }
    const tid = normalizeBrazilTaxIdInput(form.tax_id);
    if (!isBrazilTaxIdDigits(tid)) {
      toast.error('Informe CPF (11) ou CNPJ (14 dígitos).');
      return false;
    }
    if (form.whatsapp_phone.trim() && !isPlausibleBrazilWhatsapp(form.whatsapp_phone)) {
      toast.error('WhatsApp inválido. Use DDD + número.');
      return false;
    }
    return true;
  };

  const handleSaveSigner = () => {
    if (!validateForm()) return;
    const payload: PdfSignerDraft = {
      localId: editingLocalId ?? newLocalId(),
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      whatsapp_phone: form.whatsapp_phone.trim()
        ? normalizeBrazilWhatsappDigits(form.whatsapp_phone)
        : '',
      tax_id: formatBrazilTaxIdDisplay(normalizeBrazilTaxIdInput(form.tax_id)),
      role: form.role,
      signing_order: editingLocalId
        ? signers.find((s) => s.localId === editingLocalId)?.signing_order ?? signers.length + 1
        : signers.length + 1,
      serverId: editingLocalId ? signers.find((s) => s.localId === editingLocalId)?.serverId : undefined,
    };

    if (editingLocalId) {
      onChange(signers.map((s) => (s.localId === editingLocalId ? { ...s, ...payload } : s)));
      toast.success('Assinante atualizado.');
    } else {
      onChange([...signers, payload]);
      toast.success('Assinante adicionado. Posicione a assinatura no documento.');
    }
    resetForm();
  };

  const startEdit = (s: PdfSignerDraft) => {
    setEditingLocalId(s.localId);
    setFormAccordion('signer-form');
    setForm({
      name: s.name,
      email: s.email,
      whatsapp_phone: s.whatsapp_phone ? formatBrazilWhatsappDisplay(s.whatsapp_phone) : '',
      tax_id: s.tax_id ?? '',
      role: s.role,
    });
  };

  const removeSigner = (localId: string) => {
    const s = signers.find((x) => x.localId === localId);
    const key = s?.serverId ?? localId;
    onRemoveSignerSignature?.(key);
    onChange(signers.filter((x) => x.localId !== localId));
    if (placementSignerId === key || placementSignerId === localId) {
      onPlacementSignerIdChange(null);
    }
    if (editingLocalId === localId) resetForm();
  };

  const startPlacement = (s: PdfSignerDraft) => {
    const id = s.serverId ?? s.localId;
    onPlacementSignerIdChange(id);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">Assinantes</h3>
          {signers.length > 0 ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {placedCount}/{signers.length}
            </span>
          ) : null}
        </div>
        {signers.length > 0 ? (
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        ) : null}
      </div>

      <Collapsible open={helpOpen} onOpenChange={setHelpOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <HelpCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">Como funciona</span>
            <ChevronDown
              className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200', helpOpen && 'rotate-180')}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <ol className="mt-2 space-y-1 rounded-lg bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <li>1. Adicione cada assinante</li>
            <li>
              2. Use <strong className="text-foreground">Inserir assinatura</strong>
            </li>
            <li>3. Clique uma vez no PDF</li>
          </ol>
        </CollapsibleContent>
      </Collapsible>

      {!documentLocked ? (
        <Accordion
          type="single"
          collapsible
          value={formAccordion}
          onValueChange={(v) => {
            setFormAccordion(v);
            if (!v) resetForm();
          }}
          className="w-full"
        >
          <AccordionItem value="signer-form" className="border-none">
            <AccordionTrigger className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-2.5 text-sm font-medium hover:no-underline hover:bg-muted/40 [&[data-state=open]]:rounded-b-none">
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {editingLocalId ? 'Editar assinante' : 'Adicionar assinante'}
              </span>
            </AccordionTrigger>
            <AccordionContent className="rounded-b-lg border border-t-0 border-dashed border-border/80 bg-muted/10 px-3 pb-3 pt-2">
              <div className="space-y-2.5">
                <div>
                  <Label htmlFor="pdf-signer-name" className="text-xs">
                    Nome *
                  </Label>
                  <Input
                    id="pdf-signer-name"
                    className="mt-1 h-9"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Nome completo"
                  />
                </div>
                <div>
                  <Label htmlFor="pdf-signer-email" className="text-xs">
                    E-mail *
                  </Label>
                  <Input
                    id="pdf-signer-email"
                    type="email"
                    className="mt-1 h-9"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="pdf-signer-wa" className="text-xs">
                    WhatsApp
                  </Label>
                  <Input
                    id="pdf-signer-wa"
                    className="mt-1 h-9"
                    value={form.whatsapp_phone}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, whatsapp_phone: formatBrazilWhatsappDisplay(e.target.value) }))
                    }
                    placeholder="(11) 99999-9999"
                    inputMode="tel"
                  />
                </div>
                <div>
                  <Label htmlFor="pdf-signer-tax" className="text-xs">
                    CPF/CNPJ *
                  </Label>
                  <Input
                    id="pdf-signer-tax"
                    className="mt-1 h-9"
                    value={form.tax_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, tax_id: formatBrazilTaxIdDisplay(e.target.value) }))
                    }
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select
                    value={form.role}
                    onValueChange={(v) => setForm((f) => ({ ...f, role: v as SignerRole }))}
                  >
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CLIENT">Cliente</SelectItem>
                      <SelectItem value="INTERNAL">Interno</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button type="button" size="sm" className="flex-1 h-9" onClick={handleSaveSigner}>
                    {editingLocalId ? 'Salvar' : 'Adicionar'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-9" onClick={resetForm}>
                    Cancelar
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}

      {sortedSigners.length > 0 ? (
        <ul className="space-y-2.5">
          {sortedSigners.map((s) => {
            const key = s.serverId ?? s.localId;
            const colorIdx = pdfSignerColorIndex(key);
            const palette = PDF_SIGNER_COLOR_PALETTE[colorIdx]!;
            const isPlacing = placementSignerId === key;
            const placed = Boolean(signaturePlacedBySignerId[key]);
            const wf = workflowStatus(placed, s.signature_invite_status, Boolean(s.signed_at));

            return (
              <li
                key={s.localId}
                className={cn(
                  'rounded-lg p-3 ring-1 ring-border/60 transition-all duration-200',
                  'bg-card/50 hover:bg-card/80',
                  isPlacing && 'ring-2 ring-primary bg-primary/[0.03]',
                )}
              >
                <div className="flex gap-2.5">
                  <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', palette.dot)} aria-hidden />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-medium leading-tight">{s.name}</p>
                      <Badge variant={wf.variant} className="h-5 gap-0.5 text-[10px] font-normal">
                        {wf.icon}
                        {wf.label}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{s.email}</p>

                    {!documentLocked ? (
                      <div className="flex flex-col gap-1.5 pt-0.5">
                        <Button
                          type="button"
                          size="sm"
                          className={cn('h-9 w-full gap-2 text-xs font-medium', isPlacing && 'animate-pulse')}
                          variant={isPlacing ? 'default' : placed ? 'outline' : 'default'}
                          onClick={() => {
                            if (isPlacing) onPlacementSignerIdChange(null);
                            else startPlacement(s);
                          }}
                        >
                          {isPlacing ? (
                            <>
                              <Crosshair className="h-3.5 w-3.5" />
                              Clique no PDF
                            </>
                          ) : placed ? (
                            <>
                              <MapPin className="h-3.5 w-3.5" />
                              Reposicionar
                            </>
                          ) : (
                            <>
                              <PenLine className="h-3.5 w-3.5" />
                              Inserir assinatura
                            </>
                          )}
                        </Button>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 flex-1 text-xs"
                            onClick={() => startEdit(s)}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Editar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 text-destructive hover:text-destructive"
                            onClick={() =>
                              placed ? onRemoveSignerSignature?.(key) : removeSigner(s.localId)
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground py-2">Nenhum assinante ainda.</p>
      )}
    </div>
  );
}

export function mapContractSignerToPdfDraft(s: {
  id: string;
  name: string;
  email: string;
  tax_id?: string | null;
  whatsapp_phone?: string | null;
  role: SignerRole;
  signing_order: number | null;
  signed_at?: string | null;
  signature_invite?: { last?: { status?: string } | null };
}): PdfSignerDraft {
  const st = s.signature_invite?.last?.status;
  return {
    localId: s.id,
    serverId: s.id,
    name: s.name,
    email: s.email,
    whatsapp_phone: s.whatsapp_phone ?? '',
    tax_id: s.tax_id ? formatBrazilTaxIdDisplay(s.tax_id) : '',
    role: s.role,
    signing_order: s.signing_order ?? 1,
    signed_at: s.signed_at,
    signature_invite_status:
      st === 'active' || st === 'expired' || st === 'revoked' || st === 'consumed' ? st : 'none',
  };
}
